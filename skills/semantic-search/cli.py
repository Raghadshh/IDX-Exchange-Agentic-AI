from __future__ import annotations
import argparse
import os
import re
import sys
from pathlib import Path
import mysql.connector
import numpy as np
from fastembed import TextEmbedding

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / ".semantic-cache"
INDEX = CACHE / "active-listings.npz"
PARTIAL = CACHE / "active-listings.partial.npz"
MODEL = "BAAI/bge-small-en-v1.5"
BATCH_SIZE = 128

def load_env() -> None:
    env_file = ROOT / ".env"
    if not env_file.exists():
        raise RuntimeError("Missing project .env with MySQL credentials.")
    for line in env_file.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        name, value = name.strip(), value.strip()
        if value[:1] in ("'", '"') and value[-1:] == value[:1]:
            value = value[1:-1]
        os.environ.setdefault(name, value)

def connect():
    names = ("MYSQL_HOST", "MYSQL_USER", "MYSQL_PASSWORD", "MYSQL_DATABASE")
    missing = [name for name in names if not os.environ.get(name)]
    if missing:
        raise RuntimeError("Missing MySQL settings: " + ", ".join(missing))
    return mysql.connector.connect(
        host=os.environ["MYSQL_HOST"],
        user=os.environ["MYSQL_USER"],
        password=os.environ["MYSQL_PASSWORD"],
        database=os.environ["MYSQL_DATABASE"],
        connection_timeout=15,
    )

def embedding_model() -> TextEmbedding:
    return TextEmbedding(model_name=MODEL, cache_dir=str(CACHE / "models"), threads=8)

def listing_text(row: dict) -> str:
    parts = [str(row["property_type"] or "home"),
             "in " + str(row["city"] or "California")]
    if row["beds"] is not None:
        parts.append(f"{row['beds']} bedrooms")
    if row["baths"] is not None:
        parts.append(f"{row['baths']} bathrooms")
    if row["sqft"] is not None:
        parts.append(f"{row['sqft']} square feet")
    remarks = re.sub(r"\s+", " ", str(row["remarks"] or "")).strip()
    return ", ".join(parts) + ". " + remarks[:700]

def unit_rows(vectors: np.ndarray) -> np.ndarray:
    vectors = np.asarray(vectors, dtype=np.float32)
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    return vectors / np.maximum(norms, 1e-12)

def save_vectors(path: Path, ids: list[int], batches: list[np.ndarray]) -> None:
    temp = path.with_suffix(".tmp")
    try:
        with temp.open("wb") as file:
            np.savez(file, ids=np.asarray(ids, dtype=np.int64),
                     vectors=np.vstack(batches), model=np.asarray(MODEL))
        os.replace(temp, path)
    finally:
        temp.unlink(missing_ok=True)

def build_index() -> None:
    CACHE.mkdir(exist_ok=True)
    model = embedding_model()
    connection = connect()
    ids: list[int] = []
    batches: list[np.ndarray] = []
    if PARTIAL.exists():
        with np.load(PARTIAL, allow_pickle=False) as saved:
            if str(saved["model"]) != MODEL:
                raise RuntimeError("Partial index model differs; remove the partial index first.")
            ids = [int(value) for value in saved["ids"]]
            batches = [saved["vectors"]]
        print(f"Resuming after {len(ids):,} listings...", flush=True)
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT id, L_Type_ AS property_type, L_City AS city, "
            "L_Keyword2 AS beds, LM_Dec_3 AS baths, LM_Int2_3 AS sqft, "
            "L_Remarks AS remarks FROM rets_property "
            "WHERE L_Status = 'Active' AND id > %s ORDER BY id", (ids[-1] if ids else 0,)
        )
        while rows := cursor.fetchmany(BATCH_SIZE):
            texts = [listing_text(row) for row in rows]
            vectors = np.stack(list(model.passage_embed(texts, batch_size=64)))
            batches.append(unit_rows(vectors))
            ids.extend(int(row["id"]) for row in rows)
            if len(ids) % 1024 < BATCH_SIZE:
                print(f"Embedded {len(ids):,} active listings...", flush=True)
            if len(ids) % 4096 < BATCH_SIZE:
                save_vectors(PARTIAL, ids, batches)
    finally:
        cursor.close()
        connection.close()
    if not ids:
        raise RuntimeError("No active listings found; index not replaced.")
    save_vectors(INDEX, ids, batches)
    PARTIAL.unlink(missing_ok=True)
    print(f"Indexed {len(ids):,} active listings locally. No API calls.")

def format_price(value) -> str:
    return "Price unavailable" if value is None else "$" + f"{float(value):,.0f}"

def format_listing(position: int, row: dict, score: float) -> str:
    address = ", ".join(
        str(part) for part in (row["address"], row["city"], row["zip"]) if part
    ) or "Address unavailable"
    details = " | ".join(
        f"{float(row[key]):g} {label}" for key, label in
        (("beds", "bed"), ("baths", "bath")) if row[key] is not None
    )
    photos = (f"{row['photo_count']} photos" if row["photo_count"] is not None
              else "photo count unavailable")
    remarks = re.sub(r"\s+", " ", str(row["remarks"] or "").replace("\ufffd", " ")).strip()
    preview = (remarks[:157] + "...") if len(remarks) > 160 else remarks
    lines = [f"{position}. {address} - {format_price(row['price'])}",
             " | ".join(filter(None, (details, photos, f"cosine {score:.3f}")))]
    if preview:
        lines.append(preview)
    return "\n".join(lines)

def search(query: str) -> None:
    if not query.strip():
        raise ValueError("Describe the kind of home you want.")
    if not INDEX.exists():
        raise RuntimeError("Index missing. Run npm.cmd run semantic:index first.")
    with np.load(INDEX, allow_pickle=False) as saved:
        if str(saved["model"]) != MODEL:
            raise RuntimeError("Index model differs. Rebuild with semantic:index.")
        ids, vectors = saved["ids"], saved["vectors"]
    if len(ids) != len(vectors):
        raise RuntimeError("Index is incomplete. Rebuild with semantic:index.")
    model = embedding_model()
    query_vector = unit_rows(np.stack(list(model.query_embed([query]))))[0]
    scores = vectors @ query_vector
    order = np.argsort(scores)[::-1]
    connection = connect()
    cursor = connection.cursor(dictionary=True)
    matches: list[tuple[dict, float]] = []
    try:
        for start in range(0, len(order), 50):
            positions = order[start:start + 50]
            candidate_ids = [int(ids[index]) for index in positions]
            placeholders = ", ".join(["%s"] * len(candidate_ids))
            cursor.execute(
                "SELECT id, L_DisplayId AS mls_number, L_Address AS address, "
                "L_City AS city, L_Zip AS zip, L_SystemPrice AS price, "
                "L_Keyword2 AS beds, LM_Dec_3 AS baths, "
                "PhotoCount AS photo_count, L_Remarks AS remarks "
                "FROM rets_property WHERE L_Status = 'Active' "
                f"AND id IN ({placeholders})", candidate_ids
            )
            active = {int(row["id"]): row for row in cursor.fetchall()}
            for index in positions:
                row = active.get(int(ids[index]))
                if row:
                    matches.append((row, float(scores[index])))
                if len(matches) == 5:
                    break
            if len(matches) == 5:
                break
    finally:
        cursor.close()
        connection.close()
    if not matches:
        print("No active matching listings found.")
        return
    print(f"Top {len(matches)} similar active listings for: {query}")
    print()
    print("\n\n".join(
        format_listing(number, row, score)
        for number, (row, score) in enumerate(matches, 1)
    ))

def main() -> None:
    parser = argparse.ArgumentParser(description="Local semantic property search")
    subcommands = parser.add_subparsers(dest="command", required=True)
    subcommands.add_parser("index", help="Embed all current active listings")
    search_parser = subcommands.add_parser("search", help="Find five similar listings")
    search_parser.add_argument("description", nargs="+")
    args = parser.parse_args()
    load_env()
    if args.command == "index":
        build_index()
    else:
        search(" ".join(args.description))

if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, mysql.connector.Error) as error:
        print(f"Semantic search error: {error}", file=sys.stderr)
        sys.exit(1)
