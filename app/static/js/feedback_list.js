// Enhanced feedback page interactions
document.addEventListener('DOMContentLoaded', function() {
    const createFeedbackBtn = document.getElementById('createFeedbackBtn');
    if (createFeedbackBtn) {
        createFeedbackBtn.addEventListener('click', function(e) {
            e.preventDefault();

            const feedbackBtn = document.getElementById('feedbackBtn');
            if (feedbackBtn) {
                feedbackBtn.click();
            } else {
                GlobalUtils.showToast('Воспользуйтесь кнопкой обратной связи в правом нижнем углу', 'info');
            }
        });
    }

    const loadMoreBtn = document.getElementById('loadMoreBtn');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', function() {
            GlobalUtils.showToast('Функция "Показать больше" будет доступна в следующем обновлении', 'info');
        });
    }

    const feedbackCards = document.querySelectorAll('.feedback-card');
    feedbackCards.forEach((card, index) => {
        card.style.animationDelay = `${index * 0.1}s`;
        card.style.animation = 'fadeInUp 0.6s ease forwards';
    });

    const statusBadges = document.querySelectorAll('.status-badge');
    statusBadges.forEach(badge => {
        badge.addEventListener('focus', function() {
            console.log('Status badge focused:', this.textContent);
        });
    });

    console.log('Feedback page enhanced interactions initialized');
});

const style = document.createElement('style');
style.textContent = `
    @keyframes fadeInUp {
        from {
            opacity: 0;
            transform: translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
    .feedback-card {
        opacity: 0;
    }
`;
document.head.appendChild(style);