// ---- Profile screen: view any user profile, edit own profile ----

import { session, myProfile, setMyProfile, profileCache, videos } from './state.js';
import { fetchProfileById, upsertMyProfile, fetchUserVideos, deleteVideoRow, uploadFile } from './api.js';
import { renderAuthUI, doSignOut } from './auth.js';
import { fetchVideos } from './feed.js';
import { escapeHtml, formatCount, heartIcon, trashIcon } from './helpers.js';

var _goHomeCb = null;

export function setProfileCallbacks(goHome) {
  _goHomeCb = goHome;
}

// ---- open profile ----
export function openProfile(userId) {
  var screen = document.getElementById('profileScreen');
  var body   = document.getElementById('profileBody');
  var title  = document.getElementById('profileTitle');
  screen.classList.add('show');
  body.innerHTML = '<div class="profile-empty">กำลังโหลด...</div>';

  fetchProfileById(userId).then(function(profile) {
    if (!profile) { body.innerHTML = '<div class="profile-empty">ไม่พบผู้ใช้รายนี้</div>'; return; }
    title.textContent = profile.username || 'โปรไฟล์';

    var isMe = session && session.user && session.user.id === userId;

    // fetch user's videos
    return fetchUserVideos(userId).then(function(userVids) {
      var totalLikes = 0;
      userVids.forEach(function(v) { totalLikes += (v.likes || 0); });

      var avatarHtml = profile.avatar_url
        ? '<img src="' + profile.avatar_url + '">'
        : escapeHtml((profile.username || '?').charAt(0).toUpperCase());

      var actionsHtml = '';
      if (isMe) {
        actionsHtml =
          '<div class="profile-actions">' +
          '<button class="btn ghost" id="editProfileBtn">แก้ไขโปรไฟล์</button>' +
          '<button class="btn danger" id="logoutBtn">ออกจากระบบ</button>' +
          '</div>';
      }

      body.innerHTML =
        '<div class="profile-header">' +
          '<div class="big-avatar">' + avatarHtml + '</div>' +
          '<h2>' + escapeHtml(profile.username) + '</h2>' +
          (profile.bio ? '<p class="bio">' + escapeHtml(profile.bio) + '</p>' : '') +
          '<div class="profile-stats">' +
            '<div><b>' + userVids.length + '</b><span>คลิป</span></div>' +
            '<div><b>' + formatCount(totalLikes) + '</b><span>ไลค์รวม</span></div>' +
          '</div>' +
          actionsHtml +
        '</div>';

      if (userVids.length) {
        var grid = document.createElement('div');
        grid.className = 'grid';
        userVids.forEach(function(v) {
          grid.appendChild(createGridItem(v, isMe));
        });
        body.appendChild(grid);
      } else {
        body.innerHTML += '<div class="profile-empty">ยังไม่มีคลิป</div>';
      }

      // bind buttons
      if (isMe) {
        var editBtn   = document.getElementById('editProfileBtn');
        var logoutBtn = document.getElementById('logoutBtn');
        if (editBtn)   editBtn.onclick   = function() { openEditProfile(); };
        if (logoutBtn) logoutBtn.onclick  = function() { doSignOut(_goHomeCb); closeProfile(); };
      }
    });
  }).catch(function(e) {
    body.innerHTML = '<div class="profile-empty">โหลดโปรไฟล์ไม่สำเร็จ: ' + escapeHtml(e.message) + '</div>';
  });
}

function createGridItem(v, canDelete) {
  var item = document.createElement('div');
  item.className = 'grid-item';

  if (v.media_type === 'image') {
    var img = document.createElement('img');
    img.src = v.video_url;
    img.alt = v.title || '';
    item.appendChild(img);
  } else {
    var vid = document.createElement('video');
    vid.src = v.video_url;
    vid.muted = true;
    vid.preload = 'metadata';
    item.appendChild(vid);
  }

  // likes overlay
  var likesEl = document.createElement('div');
  likesEl.className = 'g-likes';
  likesEl.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/></svg> ' + formatCount(v.likes || 0);
  item.appendChild(likesEl);

  // delete button
  if (canDelete) {
    var delBtn = document.createElement('button');
    delBtn.className = 'del-btn';
    delBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    delBtn.onclick = function(e) {
      e.stopPropagation();
      if (!confirm('ลบคลิปนี้?')) return;
      deleteVideoRow(v.id).then(function() {
        fetchVideos();
        openProfile(session.user.id); // refresh profile
      });
    };
    item.appendChild(delBtn);
  }

  // click grid item → scroll to it in feed
  item.onclick = function() {
    closeProfile();
    var idx = videos.findIndex(function(fv) { return fv.id === v.id; });
    if (idx >= 0) {
      var feedEl = document.getElementById('feed');
      var card = feedEl.children[idx];
      if (card) card.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return item;
}

// ---- close profile ----
export function closeProfile() {
  document.getElementById('profileScreen').classList.remove('show');
}

// ---- edit profile sheet ----
function openEditProfile() {
  if (!myProfile) return;
  document.getElementById('edUsername').value  = myProfile.username || '';
  document.getElementById('edBio').value       = myProfile.bio || '';
  document.getElementById('edErr').textContent = '';
  document.getElementById('avatarFile').value  = '';
  document.getElementById('avatarDropLabel').textContent = 'แตะเพื่อเลือกรูปโปรไฟล์ใหม่ (ไม่บังคับ)';
  document.getElementById('avatarDropZone').classList.remove('has-file');
  document.getElementById('editOverlay').classList.add('show');
}

function closeEditProfile() {
  document.getElementById('editOverlay').classList.remove('show');
}

function submitEditProfile() {
  var username = document.getElementById('edUsername').value.trim();
  var bio      = document.getElementById('edBio').value.trim();
  var errEl    = document.getElementById('edErr');
  var file     = document.getElementById('avatarFile').files[0];

  if (!username) { errEl.textContent = 'กรุณาใส่ชื่อผู้ใช้'; return; }

  var submitBtn = document.getElementById('edSubmit');
  submitBtn.disabled = true;
  submitBtn.textContent = 'กำลังบันทึก...';
  errEl.textContent = '';

  var chain = Promise.resolve(myProfile.avatar_url);

  // upload new avatar if selected
  if (file) {
    chain = uploadFile(file, 'avatar_').then(function(url) { return url; });
  }

  chain.then(function(avatarUrl) {
    var fields = { username: username, bio: bio };
    if (avatarUrl) fields.avatar_url = avatarUrl;
    return upsertMyProfile(session.user.id, fields);
  }).then(function(updated) {
    setMyProfile(updated);
    profileCache[session.user.id] = updated;
    renderAuthUI();
    closeEditProfile();
    openProfile(session.user.id); // refresh profile view
  }).catch(function(e) {
    errEl.textContent = e.message || 'บันทึกไม่สำเร็จ';
  }).finally(function() {
    submitBtn.disabled = false;
    submitBtn.textContent = 'บันทึก';
  });
}

// ---- event binding ----
export function bindProfileEvents() {
  document.getElementById('profileBack').onclick = closeProfile;
  document.getElementById('edCancel').onclick     = closeEditProfile;
  document.getElementById('edSubmit').onclick     = submitEditProfile;

  document.getElementById('avatarFile').onchange = function() {
    if (this.files[0]) {
      document.getElementById('avatarDropLabel').textContent = this.files[0].name;
      document.getElementById('avatarDropZone').classList.add('has-file');
    }
  };

  document.getElementById('editOverlay').onclick = function(e) {
    if (e.target === this) closeEditProfile();
  };
}
