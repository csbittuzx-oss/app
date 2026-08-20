package com.auramusic.app.data.lastfm

/**
 * Last.fm Read-Only Metadata & Recommendations Response Models
 */

// ── FEATURE 1: Artist Info Response ──────────────────────────────────────────
data class ArtistInfoResponse(
    val artist: LastFmArtist? = null
)

data class LastFmArtist(
    val name: String = "",
    val mbid: String? = null,
    val url: String? = null,
    val image: List<LastFmImage>? = null,
    val stats: LastFmStats? = null,
    val bio: LastFmBio? = null,
    val tags: LastFmTags? = null
)

data class LastFmStats(
    val listeners: String? = "0",
    val playcount: String? = "0"
)

data class LastFmBio(
    val summary: String? = null,
    val content: String? = null,
    val published: String? = null
)

data class LastFmTags(
    val tag: List<LastFmTag>? = null
)

data class LastFmTag(
    val name: String = "",
    val url: String? = null
)

data class LastFmImage(
    val text: String? = null,
    val size: String? = null
)

// ── FEATURE 2: Similar Tracks & Artists Response ────────────────────────────
data class SimilarTracksResponse(
    val similartracks: SimilarTracksList? = null
)

data class SimilarTracksList(
    val track: List<SimilarTrackItem>? = null
)

data class SimilarTrackItem(
    val name: String = "",
    val match: String? = "0",
    val duration: String? = "0",
    val playcount: String? = "0",
    val artist: LastFmArtistName? = null,
    val image: List<LastFmImage>? = null,
    val url: String? = null
)

data class LastFmArtistName(
    val name: String = "",
    val mbid: String? = null,
    val url: String? = null
)

data class SimilarArtistsResponse(
    val similarartists: SimilarArtistsList? = null
)

data class SimilarArtistsList(
    val artist: List<LastFmArtist>? = null
)

// ── FEATURE 3: Album Info Response ──────────────────────────────────────────
data class AlbumInfoResponse(
    val album: LastFmAlbum? = null
)

data class LastFmAlbum(
    val name: String = "",
    val artist: String = "",
    val mbid: String? = null,
    val url: String? = null,
    val image: List<LastFmImage>? = null,
    val listeners: String? = "0",
    val playcount: String? = "0",
    val wiki: LastFmBio? = null,
    val tags: LastFmTags? = null,
    val tracks: LastFmAlbumTracks? = null
)

data class LastFmAlbumTracks(
    val track: List<LastFmAlbumTrackItem>? = null
)

data class LastFmAlbumTrackItem(
    val name: String = "",
    val duration: String? = "0",
    val url: String? = null
)

// ── FEATURE 4: Top Charts Response ──────────────────────────────────────────
data class TopChartsTracksResponse(
    val tracks: TopTracksList? = null
)

data class TopTracksList(
    val track: List<SimilarTrackItem>? = null
)

data class TopChartsArtistsResponse(
    val artists: TopArtistsList? = null
)

data class TopArtistsList(
    val artist: List<LastFmArtist>? = null
)

// ── FEATURE 5: Genre & Tag Top Tracks Response ──────────────────────────────
data class TagTopTracksResponse(
    val tracks: TopTracksList? = null
)
