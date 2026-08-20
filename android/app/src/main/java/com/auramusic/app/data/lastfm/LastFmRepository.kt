package com.auramusic.app.data.lastfm

import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.concurrent.ConcurrentHashMap

/**
 * LastFmRepository (Kotlin)
 * Provides unauthenticated read-only Last.fm music metadata with safe runCatching
 * error handling and in-memory TTL caching.
 */
class LastFmRepository(
    private val apiKey: String = "b25b959554ed76058ac220b7b2e0a026",
    private val baseUrl: String = "https://ws.audioscrobbler.com/2.0/"
) {
    companion object {
        @Volatile
        private var instance: LastFmRepository? = null

        fun getInstance(apiKey: String = "b25b959554ed76058ac220b7b2e0a026"): LastFmRepository {
            return instance ?: synchronized(this) {
                instance ?: LastFmRepository(apiKey).also { instance = it }
            }
        }
    }

    private data class CacheEntry(val data: String, val timestamp: Long)
    private val cache = ConcurrentHashMap<String, CacheEntry>()
    private val cacheTtlMs = 15 * 60 * 1000L // 15 minutes

    private fun getFromCache(key: String): String? {
        val entry = cache[key] ?: return null
        if (System.currentTimeMillis() - entry.timestamp > cacheTtlMs) {
            cache.remove(key)
            return null
        }
        return entry.data
    }

    private fun saveToCache(key: String, data: String) {
        cache[key] = CacheEntry(data, System.currentTimeMillis())
    }

    private fun executeHttpGet(params: Map<String, String>): Result<String> = runCatching {
        val query = params.entries.joinToString("&") { (k, v) ->
            "${URLEncoder.encode(k, "UTF-8")}=${URLEncoder.encode(v, "UTF-8")}"
        }
        val fullUrl = "$baseUrl?$query&api_key=$apiKey&format=json&autocorrect=1"
        val cacheKey = fullUrl

        val cached = getFromCache(cacheKey)
        if (cached != null) {
            return@runCatching cached
        }

        val url = URL(fullUrl)
        val conn = url.openConnection() as HttpURLConnection
        conn.requestMethod = "GET"
        conn.connectTimeout = 8000
        conn.readTimeout = 8000
        conn.setRequestProperty("User-Agent", "Soundwave-Android/1.2")

        val responseCode = conn.responseCode
        if (responseCode != HttpURLConnection.HTTP_OK) {
            throw Exception("HTTP $responseCode from Last.fm API")
        }

        val reader = BufferedReader(InputStreamReader(conn.inputStream))
        val response = reader.use { it.readText() }
        conn.disconnect()

        saveToCache(cacheKey, response)
        response
    }

    /**
     * FEATURE 1: Artist Biography & Wiki (artist.getInfo)
     */
    fun getArtistInfo(artistName: String): Result<ArtistInfoResponse> = runCatching {
        val jsonStr = executeHttpGet(mapOf("method" to "artist.getInfo", "artist" to artistName)).getOrThrow()
        val root = JSONObject(jsonStr)
        val artistObj = root.optJSONObject("artist") ?: return@runCatching ArtistInfoResponse(null)

        val statsObj = artistObj.optJSONObject("stats")
        val bioObj = artistObj.optJSONObject("bio")
        val tagsObj = artistObj.optJSONObject("tags")

        val tagList = mutableListOf<LastFmTag>()
        tagsObj?.optJSONArray("tag")?.let { arr ->
            for (i in 0 until arr.length()) {
                val t = arr.optJSONObject(i)
                if (t != null) tagList.add(LastFmTag(name = t.optString("name", "")))
            }
        }

        ArtistInfoResponse(
            artist = LastFmArtist(
                name = artistObj.optString("name", artistName),
                mbid = artistObj.optString("mbid", null),
                url = artistObj.optString("url", null),
                stats = LastFmStats(
                    listeners = statsObj?.optString("listeners", "0"),
                    playcount = statsObj?.optString("playcount", "0")
                ),
                bio = LastFmBio(
                    summary = bioObj?.optString("summary", "")?.replace(Regex("<[^>]*>"), "")?.trim(),
                    content = bioObj?.optString("content", "")?.replace(Regex("<[^>]*>"), "")?.trim()
                ),
                tags = LastFmTags(tag = tagList)
            )
        )
    }

    /**
     * FEATURE 2: Similar Songs (track.getSimilar)
     */
    fun getSimilarTracks(artist: String, track: String, limit: Int = 10): Result<SimilarTracksResponse> = runCatching {
        val jsonStr = executeHttpGet(
            mapOf("method" to "track.getSimilar", "artist" to artist, "track" to track, "limit" to limit.toString())
        ).getOrThrow()
        val root = JSONObject(jsonStr)
        val tracksList = mutableListOf<SimilarTrackItem>()
        val arr = root.optJSONObject("similartracks")?.optJSONArray("track")
        if (arr != null) {
            for (i in 0 until arr.length()) {
                val item = arr.optJSONObject(i) ?: continue
                val artistObj = item.optJSONObject("artist")
                tracksList.add(
                    SimilarTrackItem(
                        name = item.optString("name", ""),
                        match = item.optString("match", "0"),
                        duration = item.optString("duration", "0"),
                        playcount = item.optString("playcount", "0"),
                        artist = LastFmArtistName(name = artistObj?.optString("name", "") ?: ""),
                        url = item.optString("url", null)
                    )
                )
            }
        }
        SimilarTracksResponse(similartracks = SimilarTracksList(track = tracksList))
    }

    /**
     * FEATURE 2 (cont): Similar Artists (artist.getSimilar)
     */
    fun getSimilarArtists(artist: String, limit: Int = 8): Result<SimilarArtistsResponse> = runCatching {
        val jsonStr = executeHttpGet(
            mapOf("method" to "artist.getSimilar", "artist" to artist, "limit" to limit.toString())
        ).getOrThrow()
        val root = JSONObject(jsonStr)
        val artistsList = mutableListOf<LastFmArtist>()
        val arr = root.optJSONObject("similarartists")?.optJSONArray("artist")
        if (arr != null) {
            for (i in 0 until arr.length()) {
                val item = arr.optJSONObject(i) ?: continue
                artistsList.add(
                    LastFmArtist(
                        name = item.optString("name", ""),
                        url = item.optString("url", null)
                    )
                )
            }
        }
        SimilarArtistsResponse(similarartists = SimilarArtistsList(artist = artistsList))
    }

    /**
     * FEATURE 3: Album Wiki & Backstory (album.getInfo)
     */
    fun getAlbumInfo(artist: String, album: String): Result<AlbumInfoResponse> = runCatching {
        val jsonStr = executeHttpGet(
            mapOf("method" to "album.getInfo", "artist" to artist, "album" to album)
        ).getOrThrow()
        val root = JSONObject(jsonStr)
        val alb = root.optJSONObject("album") ?: return@runCatching AlbumInfoResponse(null)

        val wikiObj = alb.optJSONObject("wiki")
        val tracksArr = alb.optJSONObject("tracks")?.optJSONArray("track")
        val trackList = mutableListOf<LastFmAlbumTrackItem>()
        if (tracksArr != null) {
            for (i in 0 until tracksArr.length()) {
                val t = tracksArr.optJSONObject(i) ?: continue
                trackList.add(
                    LastFmAlbumTrackItem(
                        name = t.optString("name", ""),
                        duration = t.optString("duration", "0"),
                        url = t.optString("url", null)
                    )
                )
            }
        }

        AlbumInfoResponse(
            album = LastFmAlbum(
                name = alb.optString("name", album),
                artist = alb.optString("artist", artist),
                listeners = alb.optString("listeners", "0"),
                playcount = alb.optString("playcount", "0"),
                wiki = LastFmBio(
                    summary = wikiObj?.optString("summary", "")?.replace(Regex("<[^>]*>"), "")?.trim(),
                    published = wikiObj?.optString("published", null)
                ),
                tracks = LastFmAlbumTracks(track = trackList),
                url = alb.optString("url", null)
            )
        )
    }

    /**
     * FEATURE 4: Global Top Charts (chart.getTopTracks & chart.getTopArtists)
     */
    fun getGlobalTopTracks(limit: Int = 20): Result<TopChartsTracksResponse> = runCatching {
        val jsonStr = executeHttpGet(
            mapOf("method" to "chart.getTopTracks", "limit" to limit.toString())
        ).getOrThrow()
        val root = JSONObject(jsonStr)
        val tracksList = mutableListOf<SimilarTrackItem>()
        val arr = root.optJSONObject("tracks")?.optJSONArray("track")
        if (arr != null) {
            for (i in 0 until arr.length()) {
                val item = arr.optJSONObject(i) ?: continue
                val artistObj = item.optJSONObject("artist")
                tracksList.add(
                    SimilarTrackItem(
                        name = item.optString("name", ""),
                        playcount = item.optString("playcount", "0"),
                        artist = LastFmArtistName(name = artistObj?.optString("name", "") ?: ""),
                        url = item.optString("url", null)
                    )
                )
            }
        }
        TopChartsTracksResponse(tracks = TopTracksList(track = tracksList))
    }

    fun getGlobalTopArtists(limit: Int = 20): Result<TopChartsArtistsResponse> = runCatching {
        val jsonStr = executeHttpGet(
            mapOf("method" to "chart.getTopArtists", "limit" to limit.toString())
        ).getOrThrow()
        val root = JSONObject(jsonStr)
        val artistsList = mutableListOf<LastFmArtist>()
        val arr = root.optJSONObject("artists")?.optJSONArray("artist")
        if (arr != null) {
            for (i in 0 until arr.length()) {
                val item = arr.optJSONObject(i) ?: continue
                artistsList.add(
                    LastFmArtist(
                        name = item.optString("name", ""),
                        stats = LastFmStats(listeners = item.optString("listeners", "0")),
                        url = item.optString("url", null)
                    )
                )
            }
        }
        TopChartsArtistsResponse(artists = TopArtistsList(artist = artistsList))
    }

    /**
     * FEATURE 5: Genre & Mood Tags (tag.getTopTracks)
     */
    fun getGenreTagTopTracks(tag: String, limit: Int = 20): Result<TagTopTracksResponse> = runCatching {
        val jsonStr = executeHttpGet(
            mapOf("method" to "tag.getTopTracks", "tag" to tag, "limit" to limit.toString())
        ).getOrThrow()
        val root = JSONObject(jsonStr)
        val tracksList = mutableListOf<SimilarTrackItem>()
        val arr = root.optJSONObject("tracks")?.optJSONArray("track")
        if (arr != null) {
            for (i in 0 until arr.length()) {
                val item = arr.optJSONObject(i) ?: continue
                val artistObj = item.optJSONObject("artist")
                tracksList.add(
                    SimilarTrackItem(
                        name = item.optString("name", ""),
                        artist = LastFmArtistName(name = artistObj?.optString("name", "") ?: ""),
                        url = item.optString("url", null)
                    )
                )
            }
        }
        TagTopTracksResponse(tracks = TopTracksList(track = tracksList))
    }
}
