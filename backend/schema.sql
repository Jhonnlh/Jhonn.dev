CREATE DATABASE IF NOT EXISTS portfolio
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE portfolio;

CREATE TABLE IF NOT EXISTS projects (
  id VARCHAR(100) NOT NULL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  image_url TEXT,
  project_url TEXT,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  deleted_at DATETIME NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id VARCHAR(100) NOT NULL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(40) DEFAULT '',
  subject VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  status ENUM('new', 'read', 'archived') NOT NULL DEFAULT 'new',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  deleted_at DATETIME NULL
);

CREATE TABLE IF NOT EXISTS message_replies (
  id VARCHAR(100) NOT NULL PRIMARY KEY,
  message_id VARCHAR(100) NOT NULL,
  sender ENUM('visitor', 'admin') NOT NULL,
  body TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS services (
  id VARCHAR(100) NOT NULL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  icon VARCHAR(20) DEFAULT '',
  features JSON NULL,
  position INT NOT NULL DEFAULT 0,
  visible BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS experience (
  id VARCHAR(100) NOT NULL PRIMARY KEY,
  role VARCHAR(255) NOT NULL,
  company VARCHAR(255) DEFAULT '',
  description TEXT NOT NULL,
  start_year INT NOT NULL,
  end_year INT NULL,
  skills JSON NULL,
  position INT NOT NULL DEFAULT 0,
  visible BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS about_content (
  id VARCHAR(100) NOT NULL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  biography TEXT NOT NULL,
  photo_url TEXT,
  updated_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS site_settings (
  id VARCHAR(100) NOT NULL PRIMARY KEY,
  site_name VARCHAR(255) NOT NULL,
  hero_title VARCHAR(255) NOT NULL,
  hero_description TEXT NOT NULL,
  email VARCHAR(255) NOT NULL,
  location VARCHAR(255) NOT NULL,
  instagram_url TEXT,
  linkedin_url TEXT,
  github_url TEXT,
  profile_image_url TEXT,
  updated_at DATETIME NOT NULL
);
