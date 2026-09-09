-- 可选：如不想让程序自动建表，可在宝塔 phpMyAdmin 中手动导入本文件
CREATE TABLE IF NOT EXISTS persons (
  id VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  avatar MEDIUMTEXT NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS matches (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS checkins (
  check_date CHAR(10) NOT NULL,
  PRIMARY KEY (check_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
