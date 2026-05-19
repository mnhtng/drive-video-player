# Nimbus Player

> A dedicated web video player for watching Google Drive videos with a cleaner interface, richer playback controls, and multiple ways to open Drive-hosted media.

Nimbus Player is a web application designed to turn Google Drive into a lightweight personal video library. Instead of relying on Google Drive's default preview interface, it provides a dedicated playback experience built around direct links, file IDs, Drive folders, playlists, and Google Drive integration entry points.

Nimbus Player focuses on making Drive-hosted videos easier to open, watch, resume, and organize from a player interface that is purpose-built for video consumption.

## Overview

Google Drive is useful for storing video files, but its default preview experience is limited for regular viewing. Nimbus Player provides a custom player layer on top of Google Drive so users can:

- Open videos from Google Drive links or file IDs.
- Watch videos in a focused player interface.
- Browse Drive folders as video playlists.
- Resume playback from the last watched position.
- Use advanced viewing modes such as theater mode, mini player, and sleep timer.
- Open videos from multiple entry points, including direct URLs, Google Drive "Open with", browser bookmarks, and extension-based shortcuts.

## Product Goals

Nimbus Player is built around three main goals:

- **Better playback experience**: provide a cleaner, more capable video player than the default Google Drive preview.
- **Faster access to Drive videos**: support direct links, file IDs, folder-based playlists, and Drive UI integrations.
- **Personal viewing continuity**: remember playback progress and viewing preferences across sessions.

## Core Capabilities

### Drive Video Playback

Nimbus Player is designed to play video files stored in Google Drive through several input formats:

- Google Drive video links.
- Google Drive file IDs.
- Google Drive folder IDs.
- Google Drive "Open with" state payloads.

After receiving a video source, Nimbus Player can resolve the Drive file, authenticate when required, and open the media in a dedicated player interface.

### Custom Video Player

The player experience is designed around a modern HTML5 video workflow with support for:

- Play, pause, seek, and volume controls.
- Fullscreen playback.
- Picture-in-Picture mode.
- Playback speed controls.
- Keyboard shortcuts.
- Captions and subtitles using VTT tracks.
- Responsive layouts for desktop and mobile screens.
- Custom styling for a branded viewing experience.

### Advanced Viewing Features

Nimbus Player extends the standard video player experience with features aimed at long-form viewing and personal media libraries:

- **Sleep Timer**: automatically stop playback after a selected duration.
- **Theater Mode**: expand the viewing area for a more immersive layout.
- **Mini Player**: keep video visible in a compact floating player.
- **Remember Position**: save and restore the last watched timestamp for each video.
- **Playlist Manager**: play multiple videos from a Drive folder.
- **Settings Panel**: manage playback preferences and extended player options.

### Google Drive Integration

Nimbus Player is designed to support multiple ways of opening Drive-hosted videos:

- **Direct URL**: open videos by passing a Drive link or file ID to Nimbus Player.
- **Open With Integration**: launch Nimbus Player from Google Drive's native "Open with" menu.
- **Drive File Browser**: browse and search video files from within Nimbus Player.
- **Folder Playlist**: convert a Drive folder into a playable video queue.
- **Bookmarklet Entry**: open a Drive video from the browser with a saved shortcut.
- **Chrome Extension Entry**: add a dedicated "Open in Player" action inside Google Drive.

### File Browsing And Search

Nimbus Player can act as a lightweight media browser for Google Drive:

- Display video files from Drive.
- Search for videos.
- Open selected videos in the player.
- Group videos from a folder into a playlist.
- Navigate between previous and next videos in the playlist.

### Playback State And Preferences

Nimbus Player can store local viewing state to improve continuity between sessions:

- Last watched position per video.
- Preferred playback speed.
- Playlist state.
- Player layout preferences.
- User-specific viewing settings.

## User Flows

### Open A Video From A Link

Users can paste a Google Drive video link or open a URL containing a file ID. Nimbus Player resolves the source and launches the video in the custom player.

### Open A Video From Google Drive

Users can select a video file in Google Drive, choose Nimbus Player from the "Open with" menu, and continue playback in a dedicated player tab.

### Open A Folder As A Playlist

Users can open a Drive folder and let Nimbus Player list the video files inside it as a playlist. Videos can then be played sequentially or selected manually.

### Open A Video With A Browser Extension

A browser extension can add an "Open in Player" action to Google Drive. When selected, the extension extracts the Drive file ID and opens the player in a new tab.

## Chrome Extension

The unpacked Chrome extension lives in [`extension`](./extension). It injects an **Open in Nimbus Player** button on Google Drive video pages and selected video files, includes a popup for opening the current file, and provides a context-menu shortcut where Chrome's native context menu is available.

## Feature Summary

| Area | Capabilities |
| --- | --- |
| Video Sources | Drive links, file IDs, folder IDs, Open With state |
| Player Controls | Playback, seeking, volume, fullscreen, PiP, speed |
| Viewing Modes | Theater mode, mini player, responsive layouts |
| Watch Continuity | Remember position, playback preferences, local state |
| Library Tools | File browser, search, folder playlists |
| Drive Entry Points | Direct URL, Open With, bookmarklet, Chrome extension |

## Product Vision

Nimbus Player is intended to be a dedicated viewing layer for videos stored in Google Drive.

Google Drive remains the storage backend, while this application provides the playback interface, playlist behavior, viewing preferences, and faster access paths that make a Drive video library easier to use.
