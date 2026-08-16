import { useState } from 'react';
import type { Playlist } from '../../data/models';
import { useApp } from '../../state/AppContext';
import { formatDuration } from '../../core/utils';
import { CONFIG } from '../../config';

interface PlaylistActionModalProps {
  playlist: Playlist | null;
  onClose: () => void;
}

export function PlaylistActionModal({ playlist, onClose }: PlaylistActionModalProps) {
  const { updatePlaylistTitle, togglePinPlaylist, deletePlaylist } = useApp();
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(playlist?.title || '');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (!playlist) return null;

  const totalSec = playlist.tracks.reduce((sum, t) => sum + t.duration, 0);
  const artworkSrc = playlist.artwork || playlist.tracks[0]?.artwork || CONFIG.ARTWORK_PLACEHOLDER;

  const handleSaveTitle = () => {
    if (editedTitle.trim()) {
      updatePlaylistTitle(playlist.id, editedTitle.trim());
      setIsEditing(false);
      onClose();
    }
  };

  const handleTogglePin = () => {
    togglePinPlaylist(playlist.id);
    onClose();
  };

  const handleDelete = () => {
    deletePlaylist(playlist.id);
    onClose();
  };

  return (
    <div
      id="playlist-action-modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 400,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        animation: 'fadeIn 200ms ease-out',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="playlist-action-bottom-sheet"
        style={{
          background: 'var(--color-surface)',
          width: '100%',
          maxWidth: 'var(--screen-max)',
          borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0',
          padding: '16px 20px',
          paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
          boxShadow: '0 -10px 40px rgba(0, 0, 0, 0.8)',
          borderTop: '1px solid var(--color-border)',
          animation: 'slideUp 250ms cubic-bezier(0, 0, 0.2, 1)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* Drag Handle */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{
            width: 36,
            height: 4,
            borderRadius: 2,
            background: 'rgba(255, 255, 255, 0.2)',
          }} />
        </div>

        {/* ── Playlist Header Banner ── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          paddingBottom: 14,
          borderBottom: '1px solid var(--color-border)',
        }}>
          {/* Artwork */}
          <div style={{
            width: 58,
            height: 58,
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            {artworkSrc ? (
              <img
                src={artworkSrc}
                alt=""
                width={58}
                height={58}
                onError={(e) => { (e.target as HTMLImageElement).src = CONFIG.ARTWORK_PLACEHOLDER; }}
                style={{ objectFit: 'cover', width: '100%', height: '100%' }}
              />
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M9 18V5l12-2v13" stroke="var(--color-text-muted)" strokeWidth="1.5" />
              </svg>
            )}
          </div>

          {/* Title & Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{
              margin: 0,
              fontSize: 'var(--text-lg)',
              fontWeight: 700,
              color: 'var(--color-text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {playlist.title}
            </h3>
            <p style={{
              margin: '3px 0 0',
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-secondary)',
            }}>
              {playlist.tracks.length} {playlist.tracks.length === 1 ? 'song' : 'songs'}
              {totalSec > 0 && ` • ${formatDuration(totalSec)}`}
              {playlist.creator && ` • ${playlist.creator}`}
            </p>
          </div>
        </div>

        {/* ── Edit Title Input View ── */}
        {isEditing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0' }}>
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
              Edit Playlist Title
            </label>
            <input
              id="edit-playlist-title-input"
              autoFocus
              type="text"
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveTitle()}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                background: 'var(--color-surface-2)',
                border: '1.5px solid var(--color-accent)',
                borderRadius: 'var(--radius-md)',
                padding: '12px 14px',
                fontSize: 'var(--text-md)',
                color: 'var(--color-text-primary)',
                fontFamily: 'var(--font-body)',
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="btn btn-ghost"
                style={{ flex: 1, padding: '10px', borderRadius: 'var(--radius-md)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveTitle}
                disabled={!editedTitle.trim()}
                className="btn btn-primary"
                style={{ flex: 1, padding: '10px', borderRadius: 'var(--radius-md)' }}
              >
                Save
              </button>
            </div>
          </div>
        ) : showDeleteConfirm ? (
          /* ── Delete Confirmation View ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
              Delete "{playlist.title}"?
            </p>
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
              This will remove the playlist from your library.
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="btn btn-ghost"
                style={{ flex: 1, padding: '10px', borderRadius: 'var(--radius-md)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-error)',
                  color: '#fff',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: 'var(--text-sm)',
                  cursor: 'pointer',
                }}
              >
                Delete
              </button>
            </div>
          </div>
        ) : (
          /* ── Actions List ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {/* 1. Pin / Unpin Playlist */}
            <button
              type="button"
              id="action-pin-playlist-btn"
              onClick={handleTogglePin}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                width: '100%',
                padding: '12px 10px',
                background: 'none',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                color: playlist.isPinned ? 'var(--color-accent)' : 'var(--color-text-primary)',
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-md)',
                fontWeight: 600,
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <div style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                background: playlist.isPinned ? 'rgba(245, 158, 11, 0.15)' : 'var(--color-surface-2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill={playlist.isPinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="17" x2="12" y2="22" />
                  <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 'var(--text-md)', fontWeight: 600 }}>
                  {playlist.isPinned ? 'Unpin playlist' : 'Pin playlist'}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 400 }}>
                  {playlist.isPinned ? 'Remove from top of library' : 'Keep at the top of your library'}
                </p>
              </div>
            </button>

            {/* 2. Edit Playlist Title */}
            <button
              type="button"
              id="action-edit-playlist-btn"
              onClick={() => {
                setEditedTitle(playlist.title);
                setIsEditing(true);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                width: '100%',
                padding: '12px 10px',
                background: 'none',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-text-primary)',
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-md)',
                fontWeight: 600,
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <div style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                background: 'var(--color-surface-2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 'var(--text-md)', fontWeight: 600 }}>
                  Edit playlist title
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 400 }}>
                  Rename this playlist
                </p>
              </div>
            </button>

            {/* 3. Delete Playlist */}
            <button
              type="button"
              id="action-delete-playlist-btn"
              onClick={() => setShowDeleteConfirm(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                width: '100%',
                padding: '12px 10px',
                background: 'none',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-error)',
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-md)',
                fontWeight: 600,
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <div style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                background: 'rgba(239, 68, 68, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 'var(--text-md)', fontWeight: 600 }}>
                  Delete playlist
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 'var(--text-xs)', color: 'rgba(239, 68, 68, 0.7)', fontWeight: 400 }}>
                  Remove from library
                </p>
              </div>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
