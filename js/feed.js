// ---- Feed rendering, video/image playback, likes ----
// ★ แก้ไข: ไม่เลื่อนอัตโนมัติ — วิดีโอเล่นวนซ้ำ, รูป progress bar ค้าง 100%

import { IMAGE_DURATION_MS, NEW_VIDEO_POLL_MS } from './config.js';
import { videos, setVideos, likedIds, observer, setObserver, newVideoPollTimer, setNewVideoPollTimer, session, myProfile } from './state.js';
import { isConfigured, fetchVideosData, fetchLatestVideo, incrementLikes, countComments, fetchProfileById } from './api.js';
import { escapeHtml, timeAgo, mutedIcon, soundIcon, heartIcon, commentIcon, formatCount } from './helpers.js';

var feedEl = document.getElementById('feed');

// ---- callbacks ที่จะถูก set จาก app.js ----
var _openUploadCb   = null;
var _openProfileCb  = null;
var _openCommentsCb = null;

export function setFeedCallbacks(openUpload, openProfile, openComments) {
  _openUploadCb   = openUpload;
  _openProfileCb  = openProfile;
  _openCommentsCb = openComments;
}

// ---- fetch & render ----
export function fetchVideos() {
  if (!isConfigured()) { renderEmpty(true); return; }
  fetchVideosData()
    .then(function(data) { setVideos(data); renderFeed(); startNewVideoPolling(); })
    .catch(function(e) { renderEmpty(false, e.message); });
}

// ---- new-video polling ----
function startNewVideoPolling() {
  if (newVideoPollTimer) clearInterval(newVideoPollTimer);
  setNewVideoPollTimer(setInterval(pollForNewVideos, NEW_VIDEO_POLL_MS));
}

function pollForNewVideos() {
  if (!isConfigured() || !videos.length) return;
  var newestKnown = videos[0].created_at;
  fetchLatestVideo()
    .then(function(rows) {
      if (rows.length && new Date(rows[0].created_at) > new Date(newestKnown)) {
        document.getElementById('newVideoPill').classList.add('show');
      }
    })
    .catch(function() {});
}

// ---- new-video pill click ----
document.getElementById('newVideoPill').onclick = function() {
  this.classList.remove('show');
  fetchVideos();
  setTimeout(function() { feedEl.scrollTo({ top: 0, behavior: 'smooth' }); }, 200);
};

// ---- empty state ----
export function renderEmpty(needsSetup, errMsg) {
  feedEl.innerHTML = '';
  var wrap = document.createElement('div');
  wrap.className = 'empty';
  if (needsSetup) {
    wrap.innerHTML =
      '<div class="ring"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg></div>' +
      '<h3>ยังไม่ได้เชื่อมต่อ Supabase</h3>' +
      '<p>เปิดไฟล์ js/config.js แล้วใส่ Supabase URL กับ anon key</p>';
  } else if (errMsg) {
    wrap.innerHTML =
      '<div class="ring" style="background:linear-gradient(135deg,#ff4d4d,#ff2d78)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v5M12 16h.01"/><circle cx="12" cy="12" r="9"/></svg></div>' +
      '<h3>โหลดฟีดไม่สำเร็จ</h3><p>' + escapeHtml(errMsg) + '</p>' +
      '<button id="emptyRetryBtn">ลองใหม่</button>';
    feedEl.appendChild(wrap);
    document.getElementById('emptyRetryBtn').onclick = fetchVideos;
    return;
  } else {
    wrap.innerHTML =
      '<div class="ring"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg></div>' +
      '<h3>ยังไม่มีคลิปเลย</h3><p>เป็นคนแรกที่อัปโหลดคลิปลงวนคลิป!</p>' +
      '<button id="emptyUploadBtn">อัปโหลดคลิปแรก</button>';
    feedEl.appendChild(wrap);
    document.getElementById('emptyUploadBtn').onclick = function() { if (_openUploadCb) _openUploadCb(); };
    return;
  }
  feedEl.appendChild(wrap);
}

// ---- enrichment: ดึง avatar_url จาก profile ----
function enrichVideos() {
  var promises = [];
  videos.forEach(function(v) {
    if (v.user_id && !v._avatar_url) {
      promises.push(
        fetchProfileById(v.user_id).then(function(p) {
          if (p && p.avatar_url) v._avatar_url = p.avatar_url;
        }).catch(function() {})
      );
    }
  });
  return Promise.all(promises);
}

// ---- main feed render ----
function renderFeed() {
  if (!videos.length) { renderEmpty(false); return; }
  if (observer) observer.disconnect();
  feedEl.innerHTML = '';

  enrichVideos().then(function() {
    videos.forEach(function(v, i) {
      feedEl.appendChild(createCard(v, i));
    });
    setupObserver();
  });
}

function createCard(v, i) {
  var card = document.createElement('div');
  card.className = 'card';
  card.dataset.index = i;
  var isImage = v.media_type === 'image';

  // ---- media element ----
  var mediaEl;
  if (isImage) {
    mediaEl = document.createElement('img');
    mediaEl.src = v.video_url;
    mediaEl.alt = v.title || '';
  } else {
    mediaEl = document.createElement('video');
    mediaEl.src = v.video_url;
    // ★ loop = true เพื่อเล่นวนซ้ำ ไม่เลื่อนอัตโนมัติ
    mediaEl.loop = true;
    mediaEl.muted = true;
    mediaEl.playsInline = true;
    mediaEl.preload = 'metadata';
  }
  card.appendChild(mediaEl);

  // ---- scrim gradient ----
  var scrim = document.createElement('div');
  scrim.className = 'scrim';
  card.appendChild(scrim);

  // ---- progress bar ----
  var progress = document.createElement('div');
  progress.className = 'progress';
  var progressBar = document.createElement('i');
  progress.appendChild(progressBar);
  card.appendChild(progress);

  // ---- start / stop ----
  if (isImage) {
    card._start = function() {
      var start = performance.now();
      function tick(now) {
        var pct = Math.min((now - start) / IMAGE_DURATION_MS, 1);
        progressBar.style.width = (pct * 100) + '%';
        if (pct < 1) {
          card._raf = requestAnimationFrame(tick);
        }
        // ★ ไม่เรียก goNext — ค้างที่ 100% แล้วให้คนดูเลื่อนเอง
      }
      card._raf = requestAnimationFrame(tick);
    };
    card._stop = function() {
      if (card._raf) cancelAnimationFrame(card._raf);
      progressBar.style.width = '0%';
    };
  } else {
    // video: ติดตาม progress bar จาก currentTime
    mediaEl.addEventListener('timeupdate', function() {
      if (mediaEl.duration) progressBar.style.width = (mediaEl.currentTime / mediaEl.duration * 100) + '%';
    });
    // ★ ไม่มี 'ended' listener → วิดีโอ loop เองอัตโนมัติ ไม่เลื่อนไปคลิปถัดไป
    card._start = function() { mediaEl.currentTime = 0; mediaEl.play().catch(function() {}); };
    card._stop  = function() { mediaEl.pause(); };

    // ---- mute/unmute button ----
    var muteBtn = document.createElement('button');
    muteBtn.className = 'icon-btn mute-btn';
    muteBtn.innerHTML = mutedIcon();
    muteBtn.onclick = function() {
      mediaEl.muted = !mediaEl.muted;
      muteBtn.innerHTML = mediaEl.muted ? mutedIcon() : soundIcon();
    };
    card.appendChild(muteBtn);
  }

  // ---- meta (title + author) ----
  var meta = document.createElement('div');
  meta.className = 'meta';
  var avatarHtml = v._avatar_url
    ? '<img src="' + v._avatar_url + '">'
    : escapeHtml((v.author || '?').charAt(0).toUpperCase());
  meta.innerHTML =
    '<h2>' + escapeHtml(v.title) + '</h2>' +
    '<div class="author-row" data-uid="' + escapeHtml(v.user_id || '') + '">' +
    '<span class="mini-avatar">' + avatarHtml + '</span>' +
    '<p>โดย ' + escapeHtml(v.author) + '<span class="dot">•</span>' + timeAgo(v.created_at) + '</p>' +
    '</div>';
  card.appendChild(meta);
  var authorRow = meta.querySelector('.author-row');
  if (v.user_id) authorRow.onclick = function() { if (_openProfileCb) _openProfileCb(v.user_id); };

  // ---- side actions (like + comment) ----
  var side = document.createElement('div');
  side.className = 'side-actions';

  // like button
  var likeBtn = document.createElement('button');
  likeBtn.className = 'like-btn' + (likedIds.has(v.id) ? ' liked' : '');
  likeBtn.innerHTML = heartIcon() + '<span class="like-count">' + formatCount(v.likes || 0) + '</span>';
  likeBtn.onclick = function() {
    if (likeBtn.classList.contains('liked')) return;
    likeBtn.classList.add('liked', 'pop');
    likedIds.add(v.id);
    v.likes = (v.likes || 0) + 1;
    likeBtn.querySelector('.like-count').textContent = formatCount(v.likes);
    setTimeout(function() { likeBtn.classList.remove('pop'); }, 300);
    incrementLikes(v.id).catch(function() {});
  };
  side.appendChild(likeBtn);

  // comment button
  var cmtBtn = document.createElement('button');
  cmtBtn.className = 'comment-btn';
  cmtBtn.innerHTML = commentIcon() + '<span class="comment-count">…</span>';
  // โหลดจำนวนคอมเมนต์
  countComments(v.id).then(function(n) {
    cmtBtn.querySelector('.comment-count').textContent = formatCount(n);
  });
  cmtBtn.onclick = function() { if (_openCommentsCb) _openCommentsCb(v.id); };
  side.appendChild(cmtBtn);

  card.appendChild(side);
  return card;
}

// ---- IntersectionObserver: auto-play visible card ----
function setupObserver() {
  var obs = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      var card = entry.target;
      if (entry.isIntersecting) {
        if (card._start) card._start();
      } else {
        if (card._stop) card._stop();
      }
    });
  }, { root: feedEl, threshold: 0.6 });

  setObserver(obs);
  Array.from(feedEl.children).forEach(function(card) {
    if (card.classList.contains('card')) obs.observe(card);
  });
}

// ---- scroll to top (logo click) ----
export function scrollFeedTop() {
  feedEl.scrollTo({ top: 0, behavior: 'smooth' });
}
