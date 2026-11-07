from __future__ import annotations

import argparse
import heapq
import sys
from pathlib import Path

import mysql.connector
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "skills" / "semantic-search"))
import cli as semantic


def number(value) -> float | None:
    try:
        result = float(value)
        return result if np.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def structured_score(target: dict, candidate: dict) -> int:
    score = 0
    price_diff = abs(float(target["price"]) - float(candidate["price"]))
    if price_diff <= 50_000:
        score += 20
    elif price_diff <= 150_000:
        score += 12
    elif price_diff <= 300_000:
        score += 5

    if target["type"] == candidate["type"]:
        score += 15
    if target["city"].casefold() == candidate["city"].casefold():
        score += 15

    sqft_diff = abs(float(target["sqft"]) - float(candidate["sqft"]))
    if sqft_diff <= 300:
        score += 10
    elif sqft_diff <= 700:
        score += 5
    return score


def recent_comps(cursor, listing: dict) -> str:
    sqft = float(listing["sqft"])
    cursor.execute(
        "SELECT COUNT(*) AS sales, AVG(ClosePrice / LivingArea) AS avg_ppsf "
        "FROM california_sold WHERE City = %s AND PropertyType = 'Residential' "
        "AND LivingArea BETWEEN %s AND %s AND LivingArea > 0 AND ClosePrice > 0 "
        "AND CloseDate >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 6 MONTH), '%Y-%m-%d') "
        "AND CloseDate <= DATE_FORMAT(CURDATE(), '%Y-%m-%d')",
        (listing["city"], max(1, sqft - 500), sqft + 500),
    )
    comp = cursor.fetchone()
    if not comp or not comp["sales"] or not comp["avg_ppsf"]:
        return "No recent local sold comps of similar size."

    estimate = float(comp["avg_ppsf"]) * sqft
    price = float(listing["price"])
    delta = (price / estimate - 1) * 100
    if delta < -20:
        assessment = "below the comp range"
    elif delta > 20:
        assessment = "above the comp range"
    else:
        assessment = "within the comp range"
    return (
        f"Price check: {assessment}; list {delta:+.1f}% vs "
        f"${estimate:,.0f} comp estimate ({int(comp['sales'])} sales, "
        f"last 6 months, within 500 sq ft)."
    )


def money(value) -> str:
    return f"${float(value):,.0f}"


def show_listing(rank: int, listing: dict, structured: int, semantic_points: float,
                 assessment: str) -> str:
    address = ", ".join(str(listing[key]) for key in ("address", "city", "zip")
                        if listing[key])
    return (
        f"{rank}. {address} - {money(listing['price'])} (MLS {listing['mls']})\n"
        f"{float(listing['beds']):g} bed | {float(listing['baths']):g} bath | "
        f"{float(listing['sqft']):,.0f} sq ft | {listing['photos']} photos\n"
        f"Match {structured + semantic_points:.1f}/100 "
        f"(details {structured}/60, description {semantic_points:.1f}/40)\n"
        f"{assessment}"
    )


def recommend(mls: str) -> None:
    if not semantic.INDEX.exists():
        raise RuntimeError("Week 6 index is missing. Run npm.cmd run semantic:index first.")
    with np.load(semantic.INDEX, allow_pickle=False) as saved:
        if str(saved["model"]) != semantic.MODEL:
            raise RuntimeError("Index model changed. Rebuild with semantic:index.")
        ids, vectors = saved["ids"], saved["vectors"]
    if len(ids) != len(vectors):
        raise RuntimeError("Index is incomplete. Rebuild with semantic:index.")

    positions = {int(listing_id): position for position, listing_id in enumerate(ids)}
    connection = semantic.connect()
    cursor = connection.cursor(dictionary=True)
    try:
        columns = (
            "id, L_DisplayId AS mls, L_Address AS address, L_City AS city, "
            "L_Zip AS zip, L_SystemPrice AS price, L_Keyword2 AS beds, "
            "LM_Dec_3 AS baths, LM_Int2_3 AS sqft, L_Type_ AS type, "
            "PhotoCount AS photos"
        )
        cursor.execute(
            f"SELECT {columns} FROM rets_property "
            "WHERE L_Status = 'Active' AND L_DisplayId = %s LIMIT 2", (mls,)
        )
        found = cursor.fetchall()
        if len(found) != 1:
            raise ValueError("Enter the MLS number of one active listing.")
        target = found[0]
        if any(number(target[key]) is None or number(target[key]) <= 0
               for key in ("price", "sqft")) or not target["city"] or not target["type"]:
            raise ValueError("That listing needs a city, type, price, and living area.")
        target_position = positions.get(int(target["id"]))
        if target_position is None:
            raise RuntimeError("Listing is absent from the index. Rebuild with semantic:index.")

        similarities = vectors @ vectors[target_position]
        cursor.execute(
            f"SELECT {columns} FROM rets_property WHERE L_Status = 'Active' "
            "AND id <> %s AND L_SystemPrice > 0 AND LM_Int2_3 > 0 "
            "AND L_City IS NOT NULL AND L_Type_ IS NOT NULL "
            "AND L_Keyword2 IS NOT NULL AND LM_Dec_3 IS NOT NULL", (target["id"],)
        )
        candidates = []
        for row in cursor:
            position = positions.get(int(row["id"]))
            if position is None:
                continue
            detail_points = structured_score(target, row)
            description_points = max(0.0, min(1.0, float(similarities[position]))) * 40
            candidates.append((detail_points + description_points,
                               description_points, -int(row["id"]), row, detail_points))

        best = heapq.nlargest(5, candidates, key=lambda item: item[:3])
        if not best:
            print("No indexed active recommendations found.")
            return
        print(f"Five active homes similar to {target['address']}, {target['city']} "
              f"(MLS {target['mls']}, {money(target['price'])}):\n")
        for rank, (_, description_points, _, row, detail_points) in enumerate(best, 1):
            print(show_listing(rank, row, detail_points, description_points,
                               recent_comps(cursor, row)))
            if rank < len(best):
                print()
    finally:
        cursor.close()
        connection.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Hybrid home recommendations")
    parser.add_argument("--mls", required=True, help="MLS number of an active home you like")
    args = parser.parse_args()
    semantic.load_env()
    recommend(args.mls.strip())


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, mysql.connector.Error) as error:
        print(f"Recommendation error: {error}", file=sys.stderr)
        sys.exit(1)
