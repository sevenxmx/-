// ============================================================
// 🎱 走位之巅 - 前端逻辑（多设备共享 MySQL 版）
// ============================================================

// ---------- 工具 ----------
function $(id) { return document.getElementById(id); }
function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () { el.classList.remove('show'); }, 2200);
}

function showLoading(show) {
    const el = $('loadStatus');
    if (show) {
        el.classList.add('show');
        el.textContent = '正在连接服务器…';
    } else {
        el.classList.remove('show');
    }
}

async function apiPost(action, payload) {
    const fd = new FormData();
    fd.append('action', action);
    Object.keys(payload || {}).forEach(function (k) {
        fd.append(k, payload[k]);
    });
    const res = await fetch('?action=' + encodeURIComponent(action), { method: 'POST', body: fd });
    let json;
    try {
        json = await res.json();
    } catch (e) {
        throw new Error('服务器返回异常');
    }
    if (!json.ok) throw new Error(json.error || '操作失败');
    return json.data;
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function formatDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
}

function todayStr() {
    return formatDate(new Date());
}

function getPerson(id) {
    return data.persons.find(function (p) { return p.id === id; }) || null;
}

function getPersonName(id) {
    const p = getPerson(id);
    return p ? p.name : '已删除';
}

function getMatchesForDate(dateStr) {
    return data.matches.filter(function (m) { return m.date === dateStr; });
}

function avatarHtml(avatar, cls) {
    const a = avatar || '👤';
    const safeCls = cls || 'avatar-sm';
    if (a.indexOf('data:') === 0 || a.indexOf('http') === 0) {
        return '<img class="' + safeCls + ' avatar-image" src="' + esc(a) + '" alt="头像">';
    }
    return '<span class="' + safeCls + ' avatar-emoji">' + esc(a) + '</span>';
}

// ---------- 数据 ----------
let data = { persons: [], matches: [] };
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth();
let currentPlayerId = null;
let pendingMatchDate = todayStr();
let lastDetailDate = null;
let victoryReturnDate = null;
let matchInProgress = null;
let matchDraft = { playerA_id: null, playerB_id: null };
let selectedAvatar = { type: 'emoji', value: '🧑' };
let cropState = null;
let cropPointers = {};
let cropGesture = null;

function normalizeServerData(raw) {
    return {
        persons: (raw.persons || []).map(function (p) {
            return { id: p.id, name: p.name, avatar: p.avatar || '🧑', created_at: p.created_at };
        }),
        matches: (raw.matches || []).map(function (m) {
            return {
                id: m.id,
                date: m.match_date,
                playerA_id: m.player_a_id,
                playerB_id: m.player_b_id,
                gameType: m.game_type,
                games: m.games || [],
                winner_id: m.winner_id || null,
                created_at: m.created_at
            };
        })
    };
}

async function loadAll() {
    const res = await fetch('?action=load');
    let json;
    try {
        json = await res.json();
    } catch (e) {
        throw new Error('服务器返回异常');
    }
    if (!json.ok) throw new Error(json.error || '读取失败');
    data = normalizeServerData(json.data);
    showLoading(false);
    renderAll();
}

// ============================================================
// 日历
// ============================================================
function getBestWinnerForDate(dateStr) {
    const matches = getMatchesForDate(dateStr);
    if (!matches.length) return null;

    const netWins = {};
    const matchWins = {};
    const players = [];

    function addPlayer(id) {
        if (!id) return;
        if (!netWins[id]) { netWins[id] = 0; matchWins[id] = 0; players.push(id); }
    }

    let lastWinnerId = null;
    matches.forEach(function (m) {
        addPlayer(m.playerA_id);
        addPlayer(m.playerB_id);
        const aWins = (m.games || []).filter(function (g) { return g === m.playerA_id; }).length;
        const bWins = (m.games || []).filter(function (g) { return g === m.playerB_id; }).length;
        if (m.playerA_id) netWins[m.playerA_id] += aWins - bWins;
        if (m.playerB_id) netWins[m.playerB_id] += bWins - aWins;
        if (m.winner_id) {
            matchWins[m.winner_id] += 1;
            lastWinnerId = m.winner_id;
        }
    });

    if (!players.length) return null;
    players.sort(function (a, b) {
        if (netWins[b] !== netWins[a]) return netWins[b] - netWins[a];
        if (matchWins[b] !== matchWins[a]) return matchWins[b] - matchWins[a];
        if (a === lastWinnerId) return -1;
        if (b === lastWinnerId) return 1;
        return 0;
    });
    // 当天没有产生任何胜者时，返回 null，不显示头像
    const top = players[0];
    if (!matchWins[top] && netWins[top] <= 0) return null;
    return top;
}

function renderCalendar() {
    const grid = $('calendarGrid');
    const display = $('monthYearDisplay');
    if (!grid || !display) return;
    display.textContent = currentYear + '年' + (currentMonth + 1) + '月';

    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startOffset = (firstDay.getDay() === 0) ? 6 : firstDay.getDay() - 1;
    const today = todayStr();

    grid.innerHTML = '';
    for (let i = 0; i < startOffset; i++) {
        const cell = document.createElement('div');
        cell.className = 'day-cell empty';
        grid.appendChild(cell);
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = formatDate(new Date(currentYear, currentMonth, d));
        const cell = document.createElement('div');
        cell.className = 'day-cell';
        const isFuture = dateStr > today;
        if (isFuture) {
            cell.classList.add('future-disabled');
        } else {
            cell.dataset.action = 'openDay';
            cell.dataset.date = dateStr;
        }
        if (dateStr === today) cell.classList.add('today');

        const bestWinnerId = getBestWinnerForDate(dateStr);
        if (bestWinnerId) {
            const p = getPerson(bestWinnerId);
            if (p) {
                cell.classList.add('has-winner');
                const cover = document.createElement('div');
                cover.className = 'day-cover';
                cover.innerHTML = avatarHtml(p.avatar, 'winner-avatar');
                cell.appendChild(cover);
                const crown = document.createElement('div');
                crown.className = 'winner-crown';
                crown.textContent = '👑';
                cell.appendChild(crown);
            } else {
                const numSpan = document.createElement('span');
                numSpan.className = 'day-number';
                numSpan.textContent = d;
                cell.appendChild(numSpan);
            }
        } else {
            const numSpan = document.createElement('span');
            numSpan.className = 'day-number';
            numSpan.textContent = d;
            cell.appendChild(numSpan);
        }

        grid.appendChild(cell);
    }
}

// ============================================================
// 统计
// ============================================================
function renderStats() {
    $('totalMatches').textContent = data.matches.length;
    $('totalPlayers').textContent = data.persons.length;

    const playerStats = {};
    data.persons.forEach(function (p) {
        playerStats[p.id] = { id: p.id, name: p.name, avatar: p.avatar, wins: 0, matches: 0 };
    });
    data.matches.forEach(function (m) {
        if (m.winner_id && playerStats[m.winner_id]) playerStats[m.winner_id].wins += 1;
        if (m.playerA_id && playerStats[m.playerA_id]) playerStats[m.playerA_id].matches += 1;
        if (m.playerB_id && playerStats[m.playerB_id]) playerStats[m.playerB_id].matches += 1;
    });

    const list = $('playerStatsList');
    const entries = Object.keys(playerStats).map(function (k) { return playerStats[k]; })
        .sort(function (a, b) { return (b.wins - a.wins) || (b.matches - a.matches); });

    if (!entries.length) {
        list.innerHTML = '<div class="empty-state"><div class="icon">👤</div><p>暂无人物</p></div>';
        return;
    }

    list.innerHTML = entries.map(function (p) {
        const rate = p.matches > 0 ? Math.round(p.wins / p.matches * 100) : 0;
        return '<div class="player-stat-item" data-action="openPlayer" data-id="' + esc(p.id) + '">' +
            '<div class="player-stat-left">' + avatarHtml(p.avatar, 'avatar-stat') +
            '<span class="pname">' + esc(p.name) + '</span></div>' +
            '<div class="player-stat-right">' +
            '<span>🏆 <span class="wins">' + p.wins + '</span></span>' +
            '<span>📊 ' + rate + '%</span></div></div>';
    }).join('');
}

function updateTodayStatus() {
    const today = todayStr();
    const winners = getWinnersListForDate(today);
    let status = '';
    if (winners.length) {
        const names = winners.map(function (id) { return getPersonName(id); }).join('、');
        status += '🏆 今日胜者：' + names;
    }
    if (!status) status = '今天还没有比赛';
    const el = $('todayStatus');
    if (el) el.textContent = status;
}

function getWinnersListForDate(dateStr) {
    return getMatchesForDate(dateStr)
        .map(function (m) { return m.winner_id; })
        .filter(function (id) { return !!id; });
}

// ============================================================
// 页面切换
// ============================================================
function switchPage(pageId) {
    document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('active'); });
    $(pageId).classList.add('active');

    const isMain = pageId === 'pageCalendar' || pageId === 'pageStats';
    $('mainHeader').style.display = isMain ? 'flex' : 'none';
    $('bottomNav').classList.toggle('hidden', !isMain);
    document.querySelectorAll('.bottom-nav .nav-item').forEach(function (n) {
        n.classList.toggle('active', n.dataset.nav === pageId);
    });

    if (pageId === 'pageCalendar') {
        $('mainHeaderTitle').innerHTML = '<img src="images/logo.png" alt="" class="app-logo"><span>走位之巅</span>';
        $('btnManagePersons').style.display = 'inline-flex';
        renderCalendar();
    }
    if (pageId === 'pageStats') {
        $('mainHeaderTitle').textContent = '📊 战绩统计';
        $('btnManagePersons').style.display = 'inline-flex';
        renderStats();
    }
    if (pageId === 'pagePlayerMatches') {
        $('btnManagePersons').style.display = 'none';
        renderPlayerMatches();
    }
}

// ============================================================
// 模态框
// ============================================================
function openModal(id) {
    $(id).classList.add('open');
}

function closeModal(id) {
    $(id).classList.remove('open');
}

function closeVictoryAndContinue() {
    closeModal('modalVictory');
    const backDate = victoryReturnDate;
    victoryReturnDate = null;
    lastDetailDate = null;
    switchPage('pageCalendar');
    if (backDate) openDayDetail(backDate);
}

// ============================================================
// 人物管理
// ============================================================
function openManagePersons() {
    renderAvatarPicker();
    renderPersonList();
    openModal('modalPersons');
}

function renderPersonList() {
    const container = $('personList');
    if (!data.persons.length) {
        container.innerHTML = '<div class="empty-state" style="padding:14px 0;"><p>还没有人物，创建一个吧</p></div>';
        return;
    }
    container.innerHTML = data.persons.map(function (p) {
        return '<span class="person-tag">' +
            avatarHtml(p.avatar, 'tag-avatar') +
            '<span class="tag-name">' + esc(p.name) + '</span>' +
            '<button type="button" title="删除" data-action="deletePerson" data-id="' + esc(p.id) + '">✕</button>' +
            '</span>';
    }).join('');
}

function renderAvatarPicker() {
    const container = $('avatarPicker');
    const avatars = ['🧑', '👩', '🧔', '👴', '👵', '👨‍🦰', '👩‍🦱', '👨‍🦳', '👩‍🦳', '👨‍🦲', '👩‍🦲', '🧒', '👦', '👧', '🧓', '👨', '👩'];
    container.innerHTML = avatars.map(function (a, i) {
        return '<span class="avatar-option' + (i === 0 ? ' selected' : '') + '" data-action="chooseEmoji" data-avatar="' + esc(a) + '">' + a + '</span>';
    }).join('');
    setAvatar('emoji', '🧑', false);
}

function setAvatar(type, value, showPicker) {
    selectedAvatar = { type: type, value: value };
    const preview = $('avatarPreview');
    if (type === 'image') {
        preview.innerHTML = '<img src="' + esc(value) + '" alt="头像">';
    } else {
        preview.textContent = value || '🧑';
    }
    if (showPicker !== false) {
        const opts = document.querySelectorAll('#avatarPicker .avatar-option');
        opts.forEach(function (o) {
            o.classList.toggle('selected', o.dataset.avatar === value);
        });
    }
    if ($('avatarFile')) $('avatarFile').value = '';
    if ($('avatarCamera')) $('avatarCamera').value = '';
}

function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
        const reader = new FileReader();
        reader.onerror = function () { reject(new Error('读取图片失败')); };
        reader.onload = function (e) { resolve(e.target.result); };
        reader.readAsDataURL(file);
    });
}

function prepareImageForCrop(file) {
    return new Promise(function (resolve, reject) {
        const reader = new FileReader();
        reader.onerror = function () { reject(new Error('读取图片失败')); };
        reader.onload = function (e) {
            const img = new Image();
            img.onerror = function () { reject(new Error('图片格式不支持')); };
            img.onload = function () {
                const max = 1000;
                let w = img.width;
                let h = img.height;
                if (w > h && w > max) { h = Math.round(h * max / w); w = max; }
                else if (h > max) { w = Math.round(w * max / h); h = max; }
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, w, h);
                ctx.drawImage(img, 0, 0, w, h);
                try {
                    resolve(canvas.toDataURL('image/jpeg', 0.88));
                } catch (err) {
                    resolve(e.target.result);
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

function compressImageFile(file) {
    return prepareImageForCrop(file);
}

// ---------- 头像裁剪 ----------
function openAvatarCrop(dataUrl) {
    const img = $('avatarCropImage');
    img.onload = function () {
        const wrap = $('avatarCropCircle');
        const rect = wrap.getBoundingClientRect();
        const viewW = rect.width || 260;
        const viewH = rect.height || 260;
        const scale = Math.max(viewW / img.naturalWidth, viewH / img.naturalHeight);
        cropState = {
            dataUrl: dataUrl,
            img: img,
            naturalW: img.naturalWidth,
            naturalH: img.naturalHeight,
            viewW: viewW,
            viewH: viewH,
            scale: scale,
            tx: (viewW - img.naturalWidth * scale) / 2,
            ty: (viewH - img.naturalHeight * scale) / 2
        };
        renderCropImage();
        openModal('modalAvatarCrop');
    };
    img.onerror = function () {
        toast('图片读取失败，请换一张');
    };
    img.src = dataUrl;
}

function renderCropImage() {
    if (!cropState) return;
    const img = $('avatarCropImage');
    const w = cropState.naturalW * cropState.scale;
    const h = cropState.naturalH * cropState.scale;
    img.style.width = w + 'px';
    img.style.height = h + 'px';
    img.style.transform = 'translate(' + cropState.tx + 'px,' + cropState.ty + 'px)';
}

function clampCrop() {
    if (!cropState) return;
    const minScale = Math.max(cropState.viewW / cropState.naturalW, cropState.viewH / cropState.naturalH);
    const maxScale = minScale * 6;
    cropState.scale = Math.max(minScale, Math.min(maxScale, cropState.scale));
    const w = cropState.naturalW * cropState.scale;
    const h = cropState.naturalH * cropState.scale;
    cropState.tx = Math.min(0, Math.max(cropState.viewW - w, cropState.tx));
    cropState.ty = Math.min(0, Math.max(cropState.viewH - h, cropState.ty));
}

function closeAvatarCrop() {
    closeModal('modalAvatarCrop');
    cropState = null;
    cropPointers = {};
    cropGesture = null;
    if ($('avatarFile')) $('avatarFile').value = '';
    if ($('avatarCamera')) $('avatarCamera').value = '';
}

function confirmAvatarCrop() {
    if (!cropState) return;
    clampCrop();
    const s = cropState;
    const sourceX = -s.tx / s.scale;
    const sourceY = -s.ty / s.scale;
    const sourceSize = s.viewW / s.scale;
    const out = 256;
    const canvas = document.createElement('canvas');
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(s.img, sourceX, sourceY, sourceSize, sourceSize, 0, 0, out, out);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    closeAvatarCrop();
    setAvatar('image', dataUrl, false);
    toast('头像已选择');
}

function cropPointerDown(e) {
    if (!cropState) return;
    e.preventDefault();
    cropPointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    const ids = Object.keys(cropPointers);
    if (ids.length === 1) {
        cropGesture = {
            mode: 'pan',
            startX: e.clientX,
            startY: e.clientY,
            startTx: cropState.tx,
            startTy: cropState.ty
        };
    } else if (ids.length === 2) {
        const p0 = cropPointers[ids[0]];
        const p1 = cropPointers[ids[1]];
        cropGesture = {
            mode: 'pinch',
            startDist: Math.sqrt(Math.pow(p1.x - p0.x, 2) + Math.pow(p1.y - p0.y, 2)),
            startScale: cropState.scale,
            startTx: cropState.tx,
            startTy: cropState.ty,
            startMidX: (p0.x + p1.x) / 2,
            startMidY: (p0.y + p1.y) / 2
        };
    }
}

function cropPointerMove(e) {
    if (!cropState || !cropPointers[e.pointerId]) return;
    e.preventDefault();
    cropPointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    const ids = Object.keys(cropPointers);
    if (!cropGesture) return;
    if (cropGesture.mode === 'pan' && ids.length === 1) {
        cropState.tx = cropGesture.startTx + (e.clientX - cropGesture.startX);
        cropState.ty = cropGesture.startTy + (e.clientY - cropGesture.startY);
    } else if (cropGesture.mode === 'pinch' && ids.length === 2) {
        const p0 = cropPointers[ids[0]];
        const p1 = cropPointers[ids[1]];
        const dist = Math.sqrt(Math.pow(p1.x - p0.x, 2) + Math.pow(p1.y - p0.y, 2));
        if (cropGesture.startDist <= 0) return;
        const newScale = cropGesture.startScale * dist / cropGesture.startDist;
        const ratio = newScale / cropGesture.startScale;
        cropState.scale = newScale;
        cropState.tx = cropGesture.startMidX - (cropGesture.startMidX - cropGesture.startTx) * ratio;
        cropState.ty = cropGesture.startMidY - (cropGesture.startMidY - cropGesture.startTy) * ratio;
    }
    clampCrop();
    renderCropImage();
}

function cropPointerEnd(e) {
    delete cropPointers[e.pointerId];
    cropGesture = null;
}

async function createPerson() {
    const nameInput = $('newPersonName');
    const name = nameInput.value.trim();
    if (!name) { toast('请输入昵称'); return; }
    const person = {
        id: generateId(),
        name: name,
        avatar: selectedAvatar.type === 'image' ? selectedAvatar.value : (selectedAvatar.value || '🧑'),
        created_at: new Date().toISOString()
    };
    try {
        await apiPost('add_person', person);
        await loadAll();
        renderPersonList();
        nameInput.value = '';
        setAvatar('emoji', '🧑', true);
        toast('已创建人物');
    } catch (e) {
        toast(e.message);
    }
}

async function deletePerson(id) {
    if (!confirm('删除该人物及其所有比赛记录？')) return;
    try {
        await apiPost('delete_person', { id: id });
        if (matchInProgress && (matchInProgress.playerA_id === id || matchInProgress.playerB_id === id)) {
            matchInProgress = null;
            switchPage('pageCalendar');
        }
        await loadAll();
        renderPersonList();
        toast('已删除');
    } catch (e) {
        toast(e.message);
    }
}

// ============================================================
// 新建比赛 / 独立页面
// ============================================================
function renderNewMatch() {
    renderPersonChoices('selectPlayerA', 'A');
    renderPersonChoices('selectPlayerB', 'B');
}

function renderPersonChoices(containerId, side) {
    const container = $(containerId);
    if (!container) return;
    if (data.persons.length < 2) {
        container.innerHTML = '<div class="empty-state" style="padding:12px 0;"><p>至少需要两位人物</p></div>';
        return;
    }
    const excludeId = side === 'A' ? matchDraft.playerB_id : matchDraft.playerA_id;
    const selectedId = side === 'A' ? matchDraft.playerA_id : matchDraft.playerB_id;
    container.innerHTML = data.persons.map(function (p) {
        let cls = 'person-option';
        if (p.id === selectedId) cls += ' selected';
        if (p.id === excludeId) cls += ' disabled';
        return '<div class="' + cls + '" data-action="choosePlayer" data-side="' + side + '" data-id="' + esc(p.id) + '">' +
            avatarHtml(p.avatar, 'avatar-big') +
            '<span class="pname">' + esc(p.name) + '</span></div>';
    }).join('');
}

function openNewMatch(dateStr) {
    pendingMatchDate = dateStr || todayStr();
    matchDraft = { playerA_id: null, playerB_id: null };
    renderNewMatch();
    $('gameTypeSelect').value = '8球';
    switchPage('pageNewMatch');
}

function backFromNewMatch() {
    const date = lastDetailDate;
    lastDetailDate = null;
    switchPage('pageCalendar');
    if (date) openDayDetail(date);
}

function choosePlayer(side, id) {
    if (side === 'A') {
        matchDraft.playerA_id = matchDraft.playerA_id === id ? null : id;
    } else {
        matchDraft.playerB_id = matchDraft.playerB_id === id ? null : id;
    }
    renderNewMatch();
}

function startMatch() {
    if (!matchDraft.playerA_id || !matchDraft.playerB_id) {
        toast('请选择两位玩家');
        return;
    }
    if (matchDraft.playerA_id === matchDraft.playerB_id) {
        toast('不能选择同一个人');
        return;
    }
    matchInProgress = {
        playerA_id: matchDraft.playerA_id,
        playerB_id: matchDraft.playerB_id,
        gameType: $('gameTypeSelect').value || '8球',
        games: [],
        date: pendingMatchDate || todayStr()
    };
    switchPage('pageMatchPlay');
    updateMatchPlayUI();
}

// ============================================================
// 比赛进行页
// ============================================================
function updateMatchPlayUI() {
    const mp = matchInProgress;
    if (!mp) return;
    const pA = getPerson(mp.playerA_id);
    const pB = getPerson(mp.playerB_id);
    const aName = pA ? pA.name : '?';
    const bName = pB ? pB.name : '?';
    const aAvatar = pA ? pA.avatar : '👤';
    const bAvatar = pB ? pB.avatar : '👤';

    $('matchPlayTitle').textContent = '⚔️ ' + aName + ' VS ' + bName;
    $('scoreA_name').textContent = aName;
    $('scoreB_name').textContent = bName;
    $('scoreA_avatar').innerHTML = avatarHtml(aAvatar, 'avatar-emoji');
    $('scoreB_avatar').innerHTML = avatarHtml(bAvatar, 'avatar-emoji');

    const winsA = mp.games.filter(function (g) { return g === mp.playerA_id; }).length;
    const winsB = mp.games.filter(function (g) { return g === mp.playerB_id; }).length;
    $('scoreA_num').textContent = winsA;
    $('scoreB_num').textContent = winsB;
    $('gameNumber').textContent = mp.games.length + 1;
    $('btnGameWinnerA').innerHTML = '🏆 ' + esc(aName) + ' 胜';
    $('btnGameWinnerB').innerHTML = '🏆 ' + esc(bName) + ' 胜';
    $('quickScoreA_avatar').innerHTML = avatarHtml(aAvatar, 'avatar-emoji');
    $('quickScoreB_avatar').innerHTML = avatarHtml(bAvatar, 'avatar-emoji');
    $('quickScoreA_label').textContent = aName;
    $('quickScoreB_label').textContent = bName;
    $('quickScoreA').value = '0';
    $('quickScoreB').value = '0';

    const history = $('gameHistory');
    if (!mp.games.length) {
        history.textContent = '暂无逐局记录';
    } else {
        history.innerHTML = mp.games.map(function (g, i) {
            const wn = getPersonName(g);
            return '<div>第' + (i + 1) + '局 · ' + esc(wn) + ' 胜</div>';
        }).join('');
        history.scrollTop = history.scrollHeight;
    }
}

function recordGame(winnerId) {
    if (!matchInProgress) return;
    matchInProgress.games.push(winnerId);
    updateMatchPlayUI();
}

function undoGame() {
    if (!matchInProgress || !matchInProgress.games.length) return;
    matchInProgress.games.pop();
    updateMatchPlayUI();
}

function confirmAbandon() {
    if (!matchInProgress) { backFromNewMatch(); return; }
    if (matchInProgress.games.length && !confirm('比赛尚未结束，确定放弃吗？')) return;
    matchInProgress = null;
    backFromNewMatch();
}

function buildMatchObject(games, winnerId) {
    const mp = matchInProgress;
    return {
        id: generateId(),
        date: mp.date || todayStr(),
        playerA_id: mp.playerA_id,
        playerB_id: mp.playerB_id,
        gameType: mp.gameType || '8球',
        games: games.slice(),
        winner_id: winnerId || null,
        created_at: new Date().toISOString()
    };
}

async function saveMatchAndShowVictory(match) {
    try {
        await apiPost('add_match', {
            id: match.id,
            date: match.date,
            playerA_id: match.playerA_id,
            playerB_id: match.playerB_id,
            gameType: match.gameType,
            games: JSON.stringify(match.games),
            winner_id: match.winner_id || '',
            created_at: match.created_at
        });
        matchInProgress = null;
        await loadAll();
        showVictoryModal(match);
    } catch (e) {
        toast(e.message);
    }
}

async function finishMatch() {
    if (!matchInProgress) return;
    const mp = matchInProgress;
    const winsA = mp.games.filter(function (g) { return g === mp.playerA_id; }).length;
    const winsB = mp.games.filter(function (g) { return g === mp.playerB_id; }).length;
    if (!winsA && !winsB) {
        if (!confirm('还没有记录任何一局，确定结束吗？')) return;
    }
    const winner = winsA === winsB ? null : (winsA > winsB ? mp.playerA_id : mp.playerB_id);
    const match = buildMatchObject(mp.games, winner);
    await saveMatchAndShowVictory(match);
}

async function quickFinish() {
    if (!matchInProgress) return;
    const a = parseInt($('quickScoreA').value, 10);
    const b = parseInt($('quickScoreB').value, 10);
    if (isNaN(a) || isNaN(b) || a < 0 || b < 0 || (a === 0 && b === 0)) {
        toast('请输入有效比分');
        return;
    }
    if (a === b) {
        toast('最终比分不能相同');
        return;
    }
    const winner = a > b ? matchInProgress.playerA_id : matchInProgress.playerB_id;
    const games = [];
    for (let i = 0; i < a; i++) games.push(matchInProgress.playerA_id);
    for (let i = 0; i < b; i++) games.push(matchInProgress.playerB_id);
    const match = buildMatchObject(games, winner);
    await saveMatchAndShowVictory(match);
}

function showVictoryModal(match) {
    const winner = match.winner_id ? getPerson(match.winner_id) : null;
    const pA = getPerson(match.playerA_id);
    const pB = getPerson(match.playerB_id);
    const aWins = (match.games || []).filter(function (g) { return g === match.playerA_id; }).length;
    const bWins = (match.games || []).filter(function (g) { return g === match.playerB_id; }).length;

    if (winner) {
        $('victoryAvatar').innerHTML = avatarHtml(winner.avatar, 'avatar-emoji');
        $('victoryTitle').textContent = '🎉 ' + winner.name + ' 获胜！';
    } else {
        $('victoryAvatar').innerHTML = '<span style="font-size:76px;">🤝</span>';
        $('victoryTitle').textContent = '本场平局';
    }
    $('victoryDetail').innerHTML =
        '<div>' + esc(pA ? pA.name : '') + ' ' + aWins + ' : ' + bWins + ' ' + esc(pB ? pB.name : '') + '</div>' +
        '<div>' + esc(match.gameType) + ' · ' + (match.games || []).length + ' 局</div>';

    victoryReturnDate = match.date && match.date !== todayStr() ? match.date : null;
    openModal('modalVictory');
}

// ============================================================
// 日期详情
// ============================================================
function openDayDetail(dateStr) {
    $('dayDetailTitle').textContent = '📅 ' + dateStr;
    const body = $('dayDetailBody');
    const matches = getMatchesForDate(dateStr);
    const today = todayStr();
    const isFuture = dateStr > today;

    let html = '';

    if (!matches.length) {
        html += '<div class="empty-state"><div class="icon">🎱</div><p>当天没有比赛</p></div>';
    } else {
        html += '<div class="match-count">共 ' + matches.length + ' 场比赛</div>';
        matches.forEach(function (m) {
            const pA = getPerson(m.playerA_id);
            const pB = getPerson(m.playerB_id);
            const aWins = (m.games || []).filter(function (g) { return g === m.playerA_id; }).length;
            const bWins = (m.games || []).filter(function (g) { return g === m.playerB_id; }).length;
            const winner = m.winner_id ? getPerson(m.winner_id) : null;
            html += '<div class="match-item"><div class="match-main">' +
                avatarHtml(pA ? pA.avatar : '?', 'avatar-sm') +
                '<div class="match-vs"><div class="names">' + esc(pA ? pA.name : '?') + ' VS ' + esc(pB ? pB.name : '?') + '</div>' +
                '<div class="meta">' + esc(m.gameType) + ' · ' + (m.games || []).length + '局</div></div>' +
                avatarHtml(pB ? pB.avatar : '?', 'avatar-sm') +
                '<div class="match-score">' + aWins + ' : ' + bWins + '</div>' +
                '</div>' +
                '<div class="match-result ' + (winner ? 'win' : 'draw') + '">' +
                (winner ? '🏆 ' + esc(winner.name) : '🤝 平局') +
                '</div></div>';
        });
    }

    if (isFuture) {
        html += '<p class="hint">未来日期不能记录比赛</p>';
    } else if (data.persons.length >= 2) {
        html += '<button class="btn btn-primary btn-block mt" data-action="newMatchOnDate" data-date="' + esc(dateStr) + '">＋ 记录比赛</button>';
    } else {
        html += '<p class="hint">至少需要两位人物才能比赛</p>';
    }

    body.innerHTML = html;
    openModal('modalDayDetail');
}

function newMatchOnDate(dateStr) {
    if (dateStr > todayStr()) {
        toast('未来日期不能记录比赛');
        return;
    }
    closeModal('modalDayDetail');
    lastDetailDate = dateStr;
    openNewMatch(dateStr);
}

// ============================================================
// 玩家历史记录（统计钻取）
// ============================================================
function openPlayerMatches(id) {
    currentPlayerId = id;
    switchPage('pagePlayerMatches');
}

function renderPlayerMatches() {
    const profileEl = $('playerProfile');
    const listEl = $('playerMatchList');
    const p = getPerson(currentPlayerId);
    if (!p) {
        profileEl.innerHTML = '<div class="empty-state"><p>人物不存在</p></div>';
        listEl.innerHTML = '';
        return;
    }
    profileEl.innerHTML = avatarHtml(p.avatar, 'profile-avatar') +
        '<div><div class="profile-name">' + esc(p.name) + '</div>' +
        '<div style="font-size:13px;color:#8e8e93;">点击下方查看战绩</div></div>';

    const matches = data.matches.filter(function (m) {
        return m.playerA_id === currentPlayerId || m.playerB_id === currentPlayerId;
    }).sort(function (a, b) {
        return String(b.date).localeCompare(String(a.date)) || String(b.created_at).localeCompare(String(a.created_at));
    });

    if (!matches.length) {
        listEl.innerHTML = '<div class="empty-state"><div class="icon">📋</div><p>暂无比赛记录</p></div>';
        return;
    }

    listEl.innerHTML = matches.map(function (m) {
        const opponent = m.playerA_id === currentPlayerId ? getPerson(m.playerB_id) : getPerson(m.playerA_id);
        const myWins = (m.games || []).filter(function (g) { return g === currentPlayerId; }).length;
        const oppWins = (m.games || []).filter(function (g) { return g !== currentPlayerId; }).length;
        const resultClass = m.winner_id === currentPlayerId ? 'win' : (m.winner_id ? 'lose' : 'draw');
        const resultText = m.winner_id === currentPlayerId ? '🏆 胜' : (m.winner_id ? '负' : '🤝 平');
        return '<div class="match-item"><div class="match-main">' +
            '<div style="text-align:center;min-width:34px;">' + avatarHtml(p.avatar, 'avatar-sm') + '</div>' +
            '<div class="match-vs"><div class="names">你 VS ' + esc(opponent ? opponent.name : '已删除') + '</div>' +
            '<div class="meta">' + esc(m.date) + ' · ' + esc(m.gameType) + '</div></div>' +
            '<div class="match-score">' + myWins + ' : ' + oppWins + '</div>' +
            '</div><div class="match-result ' + resultClass + '">' + resultText + '</div></div>';
    }).join('');
}

// ============================================================
// 全局渲染
// ============================================================
function renderAll() {
    renderCalendar();
    renderStats();
    updateTodayStatus();
    if (currentPlayerId && $('pagePlayerMatches').classList.contains('active')) renderPlayerMatches();
    if ($('modalPersons').classList.contains('open')) renderPersonList();
}

// ============================================================
// 事件绑定
// ============================================================
function bindEvents() {
    // 导航
    document.querySelectorAll('.bottom-nav .nav-item').forEach(function (item) {
        item.addEventListener('click', function () {
            switchPage(item.dataset.nav);
            document.querySelectorAll('.bottom-nav .nav-item').forEach(function (n) { n.classList.remove('active'); });
            item.classList.add('active');
        });
    });

    // 月份
    $('prevMonth').addEventListener('click', function () {
        if (currentMonth === 0) { currentMonth = 11; currentYear--; }
        else currentMonth--;
        renderCalendar();
    });
    $('nextMonth').addEventListener('click', function () {
        if (currentMonth === 11) { currentMonth = 0; currentYear++; }
        else currentMonth++;
        renderCalendar();
    });

    // 管理人物
    $('btnManagePersons').addEventListener('click', openManagePersons);

    // 记录比赛入口
    $('btnNewMatch').addEventListener('click', function () {
        lastDetailDate = null;
        openNewMatch(todayStr());
    });

    // 子页面返回
    $('btnNewMatchBack').addEventListener('click', backFromNewMatch);
    $('btnMatchPlayBack').addEventListener('click', confirmAbandon);
    $('btnPlayerMatchesBack').addEventListener('click', function () {
        currentPlayerId = null;
        switchPage('pageStats');
    });

    // 新建比赛
    $('btnStartMatch').addEventListener('click', startMatch);

    // 比赛操作
    $('btnGameWinnerA').addEventListener('click', function () {
        if (matchInProgress) recordGame(matchInProgress.playerA_id);
    });
    $('btnGameWinnerB').addEventListener('click', function () {
        if (matchInProgress) recordGame(matchInProgress.playerB_id);
    });
    $('btnUndoGame').addEventListener('click', undoGame);
    $('btnFinishMatch').addEventListener('click', finishMatch);
    $('btnQuickFinish').addEventListener('click', quickFinish);

    // 管理人物按钮
    $('btnCreatePerson').addEventListener('click', createPerson);
    $('btnUseEmoji').addEventListener('click', function () {
        setAvatar('emoji', '🧑', true);
    });
    async function handleAvatarSelected(e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        try {
            const dataUrl = await prepareImageForCrop(file);
            openAvatarCrop(dataUrl);
        } catch (err) {
            toast(err.message);
        }
    }
    $('avatarCamera').addEventListener('change', handleAvatarSelected);
    $('avatarFile').addEventListener('change', handleAvatarSelected);

    // 头像裁剪
    $('btnCropClose').addEventListener('click', closeAvatarCrop);
    $('btnCropCancel').addEventListener('click', closeAvatarCrop);
    $('btnCropConfirm').addEventListener('click', confirmAvatarCrop);
    const cropCircle = $('avatarCropCircle');
    cropCircle.addEventListener('pointerdown', cropPointerDown);
    cropCircle.addEventListener('pointermove', cropPointerMove);
    cropCircle.addEventListener('pointerup', cropPointerEnd);
    cropCircle.addEventListener('pointercancel', cropPointerEnd);

    // 点击全局动态动作
    document.addEventListener('click', async function (e) {
        const el = e.target.closest('[data-action]');
        if (!el) return;
        const action = el.dataset.action;

        if (action === 'openDay') {
            openDayDetail(el.dataset.date);
        } else if (action === 'choosePlayer') {
            choosePlayer(el.dataset.side, el.dataset.id);
        } else if (action === 'chooseEmoji') {
            setAvatar('emoji', el.dataset.avatar, true);
        } else if (action === 'deletePerson') {
            await deletePerson(el.dataset.id);
        } else if (action === 'newMatchOnDate') {
            newMatchOnDate(el.dataset.date);
        } else if (action === 'openPlayer') {
            openPlayerMatches(el.dataset.id);
        }
    });

    // 模态框关闭按钮
    document.querySelectorAll('[data-close]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            const id = btn.dataset.close;
            if (id === 'modalVictory') {
                closeVictoryAndContinue();
                return;
            }
            closeModal(id);
        });
    });

    // 点击遮罩关闭
    document.querySelectorAll('.modal-overlay').forEach(function (overlay) {
        overlay.addEventListener('click', function (e) {
            if (e.target !== overlay) return;
            if (overlay.id === 'modalVictory') {
                closeVictoryAndContinue();
                return;
            }
            if (overlay.id === 'modalPersons') {
                overlay.classList.remove('open');
                return;
            }
            if (overlay.id === 'modalAvatarCrop') {
                closeAvatarCrop();
                return;
            }
            overlay.classList.remove('open');
        });
    });
}

// ============================================================
// 初始化
// ============================================================
document.addEventListener('DOMContentLoaded', function () {
    bindEvents();
    showLoading(true);
    loadAll().catch(function (err) {
        showLoading(false);
        const status = $('loadStatus');
        status.classList.add('show');
        status.innerHTML = '⚠️ ' + esc(err.message) + '<br><small>请检查 config.php 数据库配置</small>';
        toast(err.message);
    });
});
