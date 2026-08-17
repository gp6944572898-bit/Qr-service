console.log('App initialized');

// Example functionality: toggle a class on body
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('toggle-theme');
  if (btn) {
    btn.addEventListener('click', () => {
      document.body.classList.toggle('dark');
    });
  }
});
