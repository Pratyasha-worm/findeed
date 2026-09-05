# Findeed

**To install:** click the green **Code** button above → **Download ZIP** → unzip it → then follow the steps below.

To add #2: go to your repo → click on README.md → click the pencil (✏️) icon to edit → paste that line right after the # Findeed title → scroll down → click Commit changes.

A Chrome extension that adds a floating panel to any Instagram profile you're viewing: pick how many recent posts to look at, sort them by likes / views / comments / engagement, and search the captions of whatever you're looking at.

Inspired by tools like Zetrr and [RostyslavDzhohola/free-sort-feed-extension](https://github.com/RostyslavDzhohola/free-sort-feed-extension) (a Reels-outlier finder) — this one focuses on caption search across a sortable post list rather than just outlier detection.

## How it works
1. Open any Instagram profile.
2. Click the 🔎 button, bottom-right.
3. Pick how many posts to scan (25 / 50 / 100 / 200 / 500 / 1K / 2K / All).
4. Click **Fetch & sort** — it scrolls the profile to load that many posts, then fetches each post's page to read its caption, like count, comment count, and view count (for videos/Reels).
5. Use the sort buttons (Date / Likes / Views / Comments / Engagement) to reorder the results instantly — no re-fetching needed, it just re-sorts what's already loaded.
6. Type in the search box to filter the current sorted list by caption keyword.
7. Click any result to open that post in a new tab.

Results are cached per profile *and* per selected count in `chrome.storage.local`, so re-opening the same "Latest 100" view is instant. Click **Re-fetch & sort** to force a fresh scan (e.g. if the profile has new posts).

## Install (unpacked, for personal use)
1. Unzip this folder somewhere permanent (don't delete it after installing — Chrome loads the extension from these files).
2. Go to `chrome://extensions`.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select this folder.
5. Visit any Instagram profile.

## How metrics are computed
- **Likes / Comments**: read from the post page's embedded data, falling back to parsing the `og:description` meta tag's summary text ("N likes, N comments - …").
- **Views**: only present for videos/Reels — Instagram doesn't expose view counts for photo posts.
- **Engagement**: `(likes + comments) / followers x 100`. Follower count is read from the profile page itself; if it can't be found, views (for videos) are used as the denominator instead.

## Notes and limitations
- **Speed**: fetching happens in small batches (4 at a time, short delay between batches) to avoid hammering Instagram. Larger counts (500+, "All") take proportionally longer the first time; cached afterward.
- **Public vs private**: works on any profile whose posts you can already see in your browser (public profiles, or private ones you follow).
- **Fragility**: this reads Instagram's page structure and embedded metadata, which Instagram can change at any time without notice. If counts or captions stop showing up, the extraction logic in `content.js` (`extractPostData`, `readFollowerCount`) likely needs updating to match Instagram's current markup.
- **Terms of Service**: automated scraping isn't something Instagram's ToS technically allows. This is meant for light personal use — reading data your own browser already has access to — not for building a product or bulk-collecting data on others' accounts.

## Files
- `manifest.json` — extension configuration (Manifest V3)
- `content.js` — scrolling, fetching, sorting, search, and UI logic
- `content.css` — styles for the floating widget
