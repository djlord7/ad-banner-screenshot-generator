#!/usr/bin/env python3
"""Generate games.json from screenshot files in public/screenshots/"""

import os
import json
import re
from collections import defaultdict

# Directory containing screenshots
SCREENSHOTS_DIR = "public/screenshots"

def normalize_game_name(filename):
    """Extract game name from filename by removing numbers and extensions"""
    # Remove extension
    name = os.path.splitext(filename)[0]

    # Handle special cherifer screenshots
    if 'cooking_diary' in name.lower() or 'cooking diary' in name.lower():
        return "Cooking Diary"
    if 'towngo' in name.lower() or 'town go' in name.lower():
        return "Town Go"
    if 'tow n go' in name.lower():
        return "Tow N Go"

    # Remove trailing numbers like " 2", " 3", "(2)", "(3)"
    name = re.sub(r'\s*\(\d+\)$', '', name)
    name = re.sub(r'\s+\d+$', '', name)

    # Normalize case-insensitive duplicates (e.g., "StealthMaster" -> "Stealth Master")
    if name.lower() == 'stealthmaster':
        return "Stealth Master"

    return name.strip()

def generate_games_json():
    """Scan screenshots directory and generate games.json"""
    
    # Get all image files
    image_files = []
    for f in os.listdir(SCREENSHOTS_DIR):
        if f.lower().endswith(('.jpg', '.jpeg', '.png')):
            image_files.append(f)
    
    # Group files by game name
    games_dict = defaultdict(list)
    for filename in sorted(image_files):
        game_name = normalize_game_name(filename)
        games_dict[game_name].append(filename)
    
    # Build games JSON structure
    games_list = []
    for idx, (game_name, screenshots) in enumerate(sorted(games_dict.items()), start=1):
        game_entry = {
            "id": f"game-{idx}",
            "name": game_name,
            "screenshots": []
        }
        
        for ss_idx, screenshot_file in enumerate(screenshots, start=1):
            screenshot_entry = {
                "id": f"{game_entry['id']}-ss{ss_idx}",
                "filename": screenshot_file,
                "bannerSize": "300x600",
                "billboards": []  # Empty - will use AI detection
            }
            game_entry["screenshots"].append(screenshot_entry)
        
        games_list.append(game_entry)
    
    # Create final JSON structure
    games_json = {"games": games_list}
    
    return games_json

if __name__ == "__main__":
    games_data = generate_games_json()
    
    # Write to file
    output_file = "data/games.json"
    with open(output_file, 'w') as f:
        json.dump(games_data, f, indent=2)
    
    print(f"✅ Generated {output_file}")
    print(f"📊 Total games: {len(games_data['games'])}")
    print(f"📸 Total screenshots: {sum(len(g['screenshots']) for g in games_data['games'])}")
    print("\n🎮 Games added:")
    for game in games_data['games']:
        screenshot_count = len(game['screenshots'])
        print(f"  - {game['name']} ({screenshot_count} screenshot{'s' if screenshot_count > 1 else ''})")
