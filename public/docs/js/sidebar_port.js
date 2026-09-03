document.addEventListener('DOMContentLoaded', function() {
    const sidebar = document.getElementById('sidebar');
    const main = document.querySelector('main');
    let timeoutId;
    
    // Remove the icon button creation and event listeners
    
    function showSidebar() {
        sidebar.style.left = '0';
        main.classList.add('sidebar-open');
    }
    
    function hideSidebar() {
        sidebar.style.left = 'calc(-1 * var(--sidebar-width))';
        main.classList.remove('sidebar-open');
    }
    
    // Only keep the hover functionality
    document.addEventListener('mousemove', function(e) {
        const triggerDistance = 50;
        if (e.clientX < triggerDistance) {
            clearTimeout(timeoutId);
            showSidebar();
        } else {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(hideSidebar, 300);
        }
    });
    
    sidebar.addEventListener('mouseenter', function() {
        clearTimeout(timeoutId);
    });
    
    sidebar.addEventListener('mouseleave', function() {
        timeoutId = setTimeout(hideSidebar, 300);
    });
});
