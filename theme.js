// Theme Toggle and Navigation Management
const themeToggle = document.getElementById('theme-toggle');
const htmlElement = document.documentElement;

function setTheme(theme) {
  htmlElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  if (themeToggle) {
    themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
}

function initializeTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  setTheme(savedTheme);
}

function toggleTheme() {
  const currentTheme = htmlElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  setTheme(newTheme);
}

function updateActiveNavLink() {
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-menu a').forEach(link => {
    const href = link.getAttribute('href');
    link.classList.toggle('active', href === currentPath || (currentPath === '' && href === 'index.html'));
  });
}

// Event Listeners
if (themeToggle) {
  themeToggle.addEventListener('click', toggleTheme);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  initializeTheme();
  updateActiveNavLink();
});
