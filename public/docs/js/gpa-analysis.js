// Common options for both charts
const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    devicePixelRatio: 2,
    options: {
        layout: {
            padding: {
                top: 10,
                right: 15,
                bottom: 10,
                left: 15
            }
        },
        elements: {
            line: {
                tension: 0.3,
                borderWidth: 2
            },
            point: {
                radius: 4,
                hitRadius: 10,
                hoverRadius: 6
            }
        },
        plugins: {
            legend: {
                labels: {
                    usePointStyle: true,
                    padding: 15,
                    font: {
                        size: 11,
                        family: "'Helvetica Neue', 'Helvetica', 'Arial', sans-serif"
                    }
                }
            }
        }
    }
};

// GPA Chart configuration with reordered datasets
const gpaCtx = document.getElementById('gpaChart').getContext('2d');
new Chart(gpaCtx, {
    type: 'line',
    data: {
        labels: [
            "2019 Fall", 
            "2020 Spring", 
            "2020 Summer", 
            "2020 Fall", 
            "2021 Spring", 
            "2021 Summer", 
            "2021 Fall", 
            "2022 Spring", 
            "2022 Summer", 
            "2022 Fall"
        ],
        datasets: [
        // Overall Trend first (bottom layer)
        {
            label: 'Overall Trend',
            data: [2.717, 2.739, 2.761, 2.784, 2.806, 2.828, 2.850, 2.873, 2.895, 2.917],
            borderColor: 'rgb(255, 115, 0)',
            backgroundColor: 'rgba(255, 115, 0, 0.1)',
            borderDash: [5, 5],
            tension: 0.3,
            borderWidth: 2,
            order: 3  // Higher number = lower layer
        },
        // Actual GPA second (middle layer)
        {
            label: 'Actual GPA',
            data: [2.56, 2.97, 2.85, 2.68, 2.68, 2.86, 2.88, 2.87, 2.88, 2.94],
            borderColor: 'rgb(136, 132, 216)',
            backgroundColor: 'rgba(136, 132, 216, 0.1)',
            tension: 0.3,
            borderWidth: 2,
            phase: ['Adjustment', 'Adjustment', 'Adjustment', 'Transition', 'Transition', 
                   'Stabilization', 'Stabilization', 'Stabilization', 'Mastery', 'Mastery'],
            order: 2  // Middle layer
        },
        // Later Terms last (top layer)
        {
            label: 'Later Terms (R² = 0.855)',
            data: [null, null, null, null, null, 2.86, 2.88, 2.87, 2.88, 2.94],
            borderColor: 'rgb(130, 202, 157)',
            backgroundColor: 'rgba(130, 202, 157, 0.1)',
            tension: 0.3,
            borderWidth: 2,
            order: 1  // Lower number = top layer
        }]
    },
    options: {
        ...commonOptions,
        scales: {
            y: {
                min: 2.5,
                max: 3,
                grid: {
                    display: true,
                    drawBorder: true,
                    drawOnChartArea: true,
                    drawTicks: true
                }
            },
            x: {
                grid: {
                    display: false
                },
                ticks: {
                    maxRotation: 45,
                    minRotation: 45,
                    font: {
                        size: 10
                    }
                }
            }
        },
        plugins: {
            legend: {
                position: 'top',
                align: 'center'
            },
            tooltip: {
                mode: 'index',
                intersect: false,
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                titleColor: '#000',
                bodyColor: '#666',
                borderColor: '#ddd',
                borderWidth: 1,
                padding: 10,
                callbacks: {
                    title: function(tooltipItems) {
                        const index = tooltipItems[0].dataIndex;
                        const phase = tooltipItems[0].dataset.phase?.[index] || '';
                        return `${tooltipItems[0].label}\nPhase: ${phase}`;
                    },
                    label: function(context) {
                        let label = context.dataset.label || '';
                        if (label) {
                            label += ': ';
                        }
                        if (context.parsed.y !== null) {
                            label += context.parsed.y.toFixed(2);
                        }
                        return label;
                    }
                }
            },
            annotation: {
                annotations: {
                    transitionLine1: {
                        type: 'line',
                        xMin: 3,
                        xMax: 3,
                        borderColor: 'rgba(0, 0, 0, 0.3)',
                        borderWidth: 2,
                        borderDash: [5, 5],
                        label: {
                            content: 'Transition Phase',
                            enabled: true,
                            position: 'top'
                        }
                    },
                    transitionLine2: {
                        type: 'line',
                        xMin: 5,
                        xMax: 5,
                        borderColor: 'rgba(0, 0, 0, 0.3)',
                        borderWidth: 2,
                        borderDash: [5, 5],
                        label: {
                            content: 'Stabilization Phase',
                            enabled: true,
                            position: 'top'
                        }
                    },
                    transitionLine3: {
                        type: 'line',
                        xMin: 8,
                        xMax: 8,
                        borderColor: 'rgba(0, 0, 0, 0.3)',
                        borderWidth: 2,
                        borderDash: [5, 5],
                        label: {
                            content: 'Mastery Phase',
                            enabled: true,
                            position: 'top'
                        }
                    }
                }
            }
        }
    }
});

// Volatility Chart
const volCtx = document.getElementById('volatilityChart').getContext('2d');
new Chart(volCtx, {
    type: 'bar',
    data: {
        labels: ['Adjustment', 'Transition', 'Stabilization', 'Mastery'],
        datasets: [{
            label: 'Grade Volatility',
            data: [0.48, 0.31, 0.15, 0.10],
            backgroundColor: 'rgb(255, 124, 67)',
            borderColor: 'rgb(255, 124, 67)',
            borderWidth: 1
        },
        {
            label: 'Average GPA',
            data: [2.62, 2.81, 2.87, 2.91],
            backgroundColor: 'rgb(130, 202, 157)',
            borderColor: 'rgb(130, 202, 157)',
            borderWidth: 1
        }]
    },
    options: {
        ...commonOptions,
        scales: {
            y: {
                beginAtZero: true,
                grid: {
                    drawBorder: true,
                    drawOnChartArea: true
                }
            },
            x: {
                grid: {
                    display: false
                }
            }
        },
        barThickness: 30,
        plugins: {
            legend: {
                position: 'top'
            },
            tooltip: {
                mode: 'index',
                intersect: false,
                callbacks: {
                    label: function(context) {
                        let label = context.dataset.label || '';
                        if (label) {
                            label += ': ';
                        }
                        if (context.parsed.y !== null) {
                            label += context.parsed.y.toFixed(2);
                        }
                        return label;
                    }
                }
            }
        }
    }
});
