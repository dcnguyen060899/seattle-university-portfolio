document.addEventListener('DOMContentLoaded', function() {
    const sidebar = document.getElementById('sidebar');
    const main = document.querySelector('main');
    let timeoutId;

    // Create the icon button
    const iconButton = document.createElement('button');
    iconButton.className = 'sidebar-icon';
    iconButton.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
        </svg>
    `;
    document.body.appendChild(iconButton);

    function showSidebar() {
        sidebar.style.left = '0';
        main.classList.add('sidebar-open');
    }

    function hideSidebar() {
        sidebar.style.left = 'calc(-1 * var(--sidebar-width))';
        main.classList.remove('sidebar-open');
    }

    // Toggle sidebar on icon click
    iconButton.addEventListener('click', function() {
        if (sidebar.style.left === '0px') {
            hideSidebar();
        } else {
            showSidebar();
        }
    });

    // Existing hover functionality
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
