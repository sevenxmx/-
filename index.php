<?php
// ============================================================
// 🎱 走位之巅 - PHP 5.6 + MySQL 5.6 多设备共享版
// ============================================================
require __DIR__ . '/config.php';

header('Content-Type: text/html; charset=utf-8');

function bc_json($data) {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data);
    exit;
}

function bc_error($msg) {
    bc_json(array('ok' => false, 'error' => $msg));
}

function bc_conn() {
    static $conn = null;
    if ($conn) return $conn;
    $conn = @mysqli_connect(BC_DB_HOST, BC_DB_USER, BC_DB_PASS, BC_DB_NAME, BC_DB_PORT);
    if (!$conn) {
        bc_error('数据库连接失败，请检查 config.php：' . mysqli_connect_error());
    }
    mysqli_set_charset($conn, 'utf8mb4');
    return $conn;
}

function bc_ensure_tables($conn) {
    $persons = "CREATE TABLE IF NOT EXISTS persons (
        id VARCHAR(50) NOT NULL,
        name VARCHAR(100) NOT NULL,
        avatar MEDIUMTEXT NOT NULL,
        created_at VARCHAR(40) NOT NULL,
        PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";

    $matches = "CREATE TABLE IF NOT EXISTS matches (
        id VARCHAR(50) NOT NULL,
        match_date CHAR(10) NOT NULL,
        player_a_id VARCHAR(50) NOT NULL,
        player_b_id VARCHAR(50) NOT NULL,
        game_type VARCHAR(50) NOT NULL,
        games TEXT NOT NULL,
        winner_id VARCHAR(50) NULL,
        created_at VARCHAR(40) NOT NULL,
        PRIMARY KEY (id),
        KEY idx_match_date (match_date),
        KEY idx_winner (winner_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";

    @mysqli_query($conn, $persons);
    @mysqli_query($conn, $matches);
}

function bc_post($key, $default = '') {
    return isset($_POST[$key]) ? $_POST[$key] : $default;
}

$action = isset($_REQUEST['action']) ? $_REQUEST['action'] : '';

if ($action !== '') {
    $conn = bc_conn();
    bc_ensure_tables($conn);

    if ($action === 'load') {
        $persons = array();
        $res = mysqli_query($conn, "SELECT id, name, avatar, created_at FROM persons ORDER BY created_at ASC, id ASC");
        if ($res) {
            while ($row = mysqli_fetch_assoc($res)) {
                $persons[] = $row;
            }
        }

        $matches = array();
        $res = mysqli_query($conn, "SELECT id, match_date, player_a_id, player_b_id, game_type, games, winner_id, created_at FROM matches ORDER BY match_date ASC, created_at ASC, id ASC");
        if ($res) {
            while ($row = mysqli_fetch_assoc($res)) {
                $g = json_decode($row['games'], true);
                $row['games'] = is_array($g) ? $g : array();
                $matches[] = $row;
            }
        }

        bc_json(array('ok' => true, 'data' => array(
            'persons' => $persons,
            'matches' => $matches
        )));
    }

    if ($action === 'add_person') {
        $id = trim(bc_post('id'));
        $name = trim(bc_post('name'));
        $avatar = bc_post('avatar');
        $created_at = bc_post('created_at');
        if ($id === '' || $name === '' || $avatar === '') {
            bc_error('人物参数不完整');
        }
        $stmt = mysqli_prepare($conn, "INSERT INTO persons (id, name, avatar, created_at) VALUES (?, ?, ?, ?)");
        if ($stmt) {
            mysqli_stmt_bind_param($stmt, 'ssss', $id, $name, $avatar, $created_at);
            mysqli_stmt_execute($stmt);
            mysqli_stmt_close($stmt);
        } else {
            bc_error('新增人物失败');
        }
        bc_json(array('ok' => true, 'data' => array('id' => $id)));
    }

    if ($action === 'delete_person') {
        $id = trim(bc_post('id'));
        if ($id === '') bc_error('缺少人物ID');
        $stmt = mysqli_prepare($conn, "DELETE FROM matches WHERE player_a_id = ? OR player_b_id = ?");
        if ($stmt) {
            mysqli_stmt_bind_param($stmt, 'ss', $id, $id);
            mysqli_stmt_execute($stmt);
            mysqli_stmt_close($stmt);
        }
        $stmt = mysqli_prepare($conn, "DELETE FROM persons WHERE id = ?");
        if ($stmt) {
            mysqli_stmt_bind_param($stmt, 's', $id);
            mysqli_stmt_execute($stmt);
            mysqli_stmt_close($stmt);
        }
        bc_json(array('ok' => true, 'data' => array('id' => $id)));
    }

    if ($action === 'add_match') {
        $id = trim(bc_post('id'));
        $date = trim(bc_post('date'));
        $playerA = trim(bc_post('playerA_id'));
        $playerB = trim(bc_post('playerB_id'));
        $gameType = trim(bc_post('gameType'));
        $games = bc_post('games');
        $winner = trim(bc_post('winner_id'));
        $created_at = bc_post('created_at');
        if ($id === '' || $date === '' || $playerA === '' || $playerB === '' || $gameType === '') {
            bc_error('比赛参数不完整');
        }
        if ($date > date('Y-m-d')) {
            bc_error('不能记录未来日期的比赛');
        }
        if ($winner === '') $winner = null;
        $stmt = mysqli_prepare($conn, "INSERT INTO matches (id, match_date, player_a_id, player_b_id, game_type, games, winner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
        if ($stmt) {
            mysqli_stmt_bind_param($stmt, 'ssssssss', $id, $date, $playerA, $playerB, $gameType, $games, $winner, $created_at);
            mysqli_stmt_execute($stmt);
            mysqli_stmt_close($stmt);
        } else {
            bc_error('保存比赛失败');
        }
        bc_json(array('ok' => true, 'data' => array('id' => $id)));
    }

    bc_error('未知操作');
}

// ============================================================
// 以下为页面 HTML（PHP 只负责输出）
// ============================================================
?><!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="走位之巅">
<meta name="format-detection" content="telephone=no">
<title>走位之巅</title>
<link rel="apple-touch-icon" href="images/logo.png">
<link rel="icon" type="image/png" href="images/logo.png">
<link rel="manifest" href="manifest.json">
<link rel="stylesheet" href="style.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
</head>
<body>
<div id="app">

    <header class="app-header" id="mainHeader">
        <h1 id="mainHeaderTitle"><img src="images/logo.png" alt="" class="app-logo"><span>走位之巅</span></h1>
        <div class="header-actions">
            <button class="icon-btn" id="btnManagePersons" title="管理人物"><i class="fas fa-user-plus"></i></button>
        </div>
    </header>

    <div id="loadStatus" class="load-status">正在连接服务器…</div>

    <!-- 页面：日历 -->
    <div id="pageCalendar" class="page active">
        <div class="calendar-header">
            <button class="icon-btn nav-btn" id="prevMonth"><i class="fas fa-chevron-left"></i></button>
            <span class="month-year" id="monthYearDisplay"></span>
            <button class="icon-btn nav-btn" id="nextMonth"><i class="fas fa-chevron-right"></i></button>
        </div>
        <div class="weekdays"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>
        <div class="calendar-grid" id="calendarGrid"></div>
        <div style="margin-top:20px;">
            <button class="btn btn-block btn-primary" id="btnNewMatch"><span>＋</span> 记录比赛</button>
        </div>
        <div class="today-status" id="todayStatus"></div>
    </div>

    <!-- 页面：统计 -->
    <div id="pageStats" class="page">
        <div class="stats-overview">
            <div class="stat-card"><div class="stat-number" id="totalMatches">0</div><div class="stat-label">总比赛</div></div>
            <div class="stat-card"><div class="stat-number" id="totalPlayers">0</div><div class="stat-label">玩家数</div></div>
        </div>
        <div class="card">
            <div class="card-title">🏆 玩家胜场</div>
            <div id="playerStatsList"></div>
        </div>
        <p class="hint">点击玩家可查看历史比赛记录</p>
    </div>

    <!-- 页面：新建比赛 -->
    <div id="pageNewMatch" class="page page-sub">
        <div class="page-head">
            <button class="icon-btn back-btn" id="btnNewMatchBack"><i class="fas fa-chevron-left"></i></button>
            <h2>🎱 记录比赛</h2>
            <span class="head-space"></span>
        </div>
        <div class="page-content">
            <div class="card">
                <div class="form-group">
                    <label>选择玩家 A</label>
                    <div class="person-select-grid" id="selectPlayerA"></div>
                </div>
                <div class="form-group">
                    <label>选择玩家 B</label>
                    <div class="person-select-grid" id="selectPlayerB"></div>
                </div>
                <div class="form-group">
                    <label>比赛类型</label>
                    <select id="gameTypeSelect">
                        <option value="8球">8球</option>
                        <option value="9球">9球</option>
                        <option value="10球">10球</option>
                        <option value="斯诺克">斯诺克</option>
                        <option value="其他">其他</option>
                    </select>
                </div>
                <button class="btn btn-primary btn-block btn-lg" id="btnStartMatch">开始比赛</button>
            </div>
        </div>
    </div>

    <!-- 页面：比赛进行中 -->
    <div id="pageMatchPlay" class="page page-sub">
        <div class="page-head">
            <button class="icon-btn back-btn" id="btnMatchPlayBack"><i class="fas fa-times"></i></button>
            <h2 id="matchPlayTitle">⚔️ 进行中</h2>
            <span class="head-space"></span>
        </div>
        <div class="page-content">
            <div class="card scoreboard" id="scoreboard">
                <div class="player-score" id="playerAScoreBox">
                    <div class="player-avatar" id="scoreA_avatar"></div>
                    <div class="player-name" id="scoreA_name">A</div>
                    <div class="score-num" id="scoreA_num">0</div>
                </div>
                <div class="vs">VS</div>
                <div class="player-score" id="playerBScoreBox">
                    <div class="player-avatar" id="scoreB_avatar"></div>
                    <div class="player-name" id="scoreB_name">B</div>
                    <div class="score-num" id="scoreB_num">0</div>
                </div>
            </div>
            <div class="game-number">第 <span id="gameNumber">1</span> 局</div>

            <div class="game-winner-buttons">
                <button class="btn btn-primary btn-block" id="btnGameWinnerA">🏆 A 胜</button>
                <button class="btn btn-glass btn-block" id="btnGameWinnerB">🏆 B 胜</button>
            </div>
            <button class="btn btn-secondary btn-block" id="btnUndoGame">↩ 撤回上局</button>
            <div id="gameHistory" class="game-history"></div>

            <div class="card quick-score-card">
                <div class="card-title">直接输入最终比分</div>
                <div class="quick-score-row">
                    <div class="quick-side">
                        <div class="quick-player" id="quickScoreA_avatar"></div>
                        <div class="quick-label" id="quickScoreA_label">A</div>
                        <input type="number" id="quickScoreA" min="0" value="0" inputmode="numeric">
                    </div>
                    <div class="quick-colon">:</div>
                    <div class="quick-side">
                        <div class="quick-player" id="quickScoreB_avatar"></div>
                        <div class="quick-label" id="quickScoreB_label">B</div>
                        <input type="number" id="quickScoreB" min="0" value="0" inputmode="numeric">
                    </div>
                </div>
                <button class="btn btn-glass btn-block" id="btnQuickFinish">保存最终比分</button>
                <p class="hint">比分不能相同；例如 5 : 3</p>
            </div>

            <button class="btn btn-primary btn-block btn-lg" id="btnFinishMatch">🏁 结束比赛</button>
        </div>
    </div>

    <!-- 页面：玩家历史比赛 -->
    <div id="pagePlayerMatches" class="page page-sub">
        <div class="page-head">
            <button class="icon-btn back-btn" id="btnPlayerMatchesBack"><i class="fas fa-chevron-left"></i></button>
            <h2>📋 比赛记录</h2>
            <span class="head-space"></span>
        </div>
        <div class="player-profile card" id="playerProfile"></div>
        <div id="playerMatchList" class="match-list"></div>
    </div>

    <nav class="bottom-nav" id="bottomNav">
        <button class="nav-item active" data-nav="pageCalendar"><i class="fas fa-calendar-day"></i><span class="nav-label">日历</span></button>
        <button class="nav-item" data-nav="pageStats"><i class="fas fa-chart-bar"></i><span class="nav-label">统计</span></button>
    </nav>

    <!-- 模态框：管理人物 -->
    <div class="modal-overlay" id="modalPersons">
        <div class="modal">
            <div class="modal-header">
                <h2>👤 管理人物</h2>
                <button class="modal-close" data-close="modalPersons">&times;</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>头像照片（可选）</label>
                    <div class="avatar-upload-row">
                        <div class="avatar-preview" id="avatarPreview">🧑</div>
                        <div class="avatar-upload-actions">
                            <label class="btn btn-secondary btn-sm" for="avatarCamera">📷 拍照</label>
                            <input type="file" id="avatarCamera" accept="image/*" capture="environment" hidden>
                            <label class="btn btn-secondary btn-sm" for="avatarFile">🖼 相册/文件</label>
                            <input type="file" id="avatarFile" accept="image/*" hidden>
                            <button class="btn btn-secondary btn-sm" id="btnUseEmoji">😀 用 Emoji</button>
                        </div>
                    </div>
                    <div class="avatar-picker" id="avatarPicker"></div>
                </div>
                <div class="form-group">
                    <label>昵称</label>
                    <input type="text" id="newPersonName" placeholder="输入昵称" maxlength="20">
                </div>
                <button class="btn btn-primary btn-block" id="btnCreatePerson">创建人物</button>
                <div class="divider"></div>
                <div class="form-group">
                    <label>现有人物</label>
                    <div id="personList"></div>
                </div>
            </div>
        </div>
    </div>

    <!-- 模态框：日期详情 -->
    <div class="modal-overlay" id="modalDayDetail">
        <div class="modal">
            <div class="modal-header">
                <h2 id="dayDetailTitle">📅 日期</h2>
                <button class="modal-close" data-close="modalDayDetail">&times;</button>
            </div>
            <div class="modal-body" id="dayDetailBody"></div>
        </div>
    </div>

    <!-- 模态框：头像裁剪 -->
    <div class="modal-overlay" id="modalAvatarCrop">
        <div class="modal modal-crop">
            <div class="modal-header">
                <h2>调整头像</h2>
                <button class="modal-close" id="btnCropClose">&times;</button>
            </div>
            <p class="crop-tip">拖动可移动位置，双指缩放可调整大小</p>
            <div class="avatar-crop-wrap">
                <div class="avatar-crop-circle" id="avatarCropCircle">
                    <img id="avatarCropImage" alt="头像裁剪">
                </div>
                <div class="avatar-crop-mask"></div>
            </div>
            <div class="crop-actions">
                <button class="btn btn-secondary" id="btnCropCancel">取消</button>
                <button class="btn btn-primary" id="btnCropConfirm">确认</button>
            </div>
        </div>
    </div>

    <!-- 模态框：胜利祝贺 -->
    <div class="modal-overlay" id="modalVictory">
        <div class="modal modal-victory">
            <div class="victory-content">
                <div id="victoryAvatar"></div>
                <h2 id="victoryTitle">🎉</h2>
                <p id="victoryDetail"></p>
                <button class="btn btn-primary btn-block btn-lg" data-close="modalVictory">太好了</button>
            </div>
        </div>
    </div>

    <div id="toast" class="toast"></div>
</div>

<script src="app.js"></script>
</body>
</html>
