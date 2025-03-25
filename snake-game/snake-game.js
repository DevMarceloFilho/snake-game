$(document).ready(function() {
    // Configurações do jogo
    const canvas = document.getElementById('snake-canvas');
    const ctx = canvas.getContext('2d');
    
    // Tamanho dos quadrados da grade
    let gridSize = 20;
    let canvasWidth = canvas.width;
    let canvasHeight = canvas.height;
    
    // Estado inicial do jogo
    let snake = [];
    let food = {};
    let direction = 'right';
    let nextDirection = 'right';
    let gameRunning = false;
    let gamePaused = false;
    let score = 0;
    let highScore = localStorage.getItem('snakeHighScore') || 0;
    let gameSpeed = 100; // milissegundos entre cada atualização
    let gameLogicLoop;
    let animationFrameId;
    let lastUpdateTime = 0;
    let lastRenderTime = 0;
    let interpolation = 0; // Valor de 0 a 1 para interpolação entre posições
    let level = 1;
    let foodEffects = [];
    let effects = [];
    
    // Sistema de posição suave para a cobra
    let smoothSnake = [];
    let targetPositions = [];
    let snakeWave = { offset: 0, speed: 0.1, amplitude: 4 };
    
    // Carregar e gerar texturas
    const textures = {
        snakePattern: null
    };
    
    // Precarregar texturas
    function loadTextures() {
        // Criar padrão de escamas da cobra usando canvas
        const patternCanvas = document.createElement('canvas');
        patternCanvas.width = 20;
        patternCanvas.height = 20;
        const patternCtx = patternCanvas.getContext('2d');
        
        // Desenhar padrão de escamas
        function drawScale(x, y, size, color) {
            patternCtx.fillStyle = color;
            patternCtx.beginPath();
            patternCtx.ellipse(x, y, size/2, size/1.5, 0, 0, Math.PI * 2);
            patternCtx.fill();
            
            // Adicionar brilho
            patternCtx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            patternCtx.beginPath();
            patternCtx.ellipse(x - size/4, y - size/4, size/4, size/6, 0, 0, Math.PI * 2);
            patternCtx.fill();
        }
        
        // Preencher com escamas
        patternCtx.fillStyle = colors.snake;
        patternCtx.fillRect(0, 0, 20, 20);
        
        // Linha 1
        drawScale(5, 5, 9, adjustColor(colors.snake, -20));
        drawScale(15, 5, 9, adjustColor(colors.snake, -15));
        
        // Linha 2
        drawScale(5, 15, 9, adjustColor(colors.snake, -25));
        drawScale(15, 15, 9, adjustColor(colors.snake, -20));
        
        // Criar padrão
        textures.snakePattern = ctx.createPattern(patternCanvas, 'repeat');
    }
    
    // Carregar e mostrar recorde
    $('#high-score-value').text(highScore);
    
    // Cores
    let colors = {
        snake: '#fc6426',
        snakeHead: '#e14d0d',
        food: '#e2a928',
        grid: '#1f1f1f'
    };
    
    // Configurações de dificuldade
    const difficulties = {
        easy: { initialSpeed: 110, speedReduction: 3, pointsPerFood: 5 },
        medium: { initialSpeed: 100, speedReduction: 5, pointsPerFood: 10 },
        hard: { initialSpeed: 80, speedReduction: 8, pointsPerFood: 15 },
        extreme: { initialSpeed: 60, speedReduction: 10, pointsPerFood: 20 }
    };
    
    // Configuração atual
    let currentDifficulty = difficulties.medium;
    let pointsPerFood = currentDifficulty.pointsPerFood;
    
    // Sons do jogo
    const createAudio = (src) => {
        const audio = new Audio();
        audio.src = src;
        return audio;
    };
    
    // Inicializar jogo
    function initGame() {
        // Aplicar configurações
        applySettings();
        
        // Resetar estado
        snake = [
            {x: 5 * gridSize, y: 10 * gridSize},
            {x: 4 * gridSize, y: 10 * gridSize},
            {x: 3 * gridSize, y: 10 * gridSize}
        ];
        
        // Inicializar sistema de posição suave
        smoothSnake = [];
        targetPositions = [];
        for (let i = 0; i < snake.length; i++) {
            smoothSnake.push({...snake[i]});
            targetPositions.push({...snake[i]});
        }
        
        // Inicializar sistema de ondulação da cobra
        snakeWave = {
            offset: 0,
            speed: 0.1,
            amplitude: 4
        };
        
        direction = 'right';
        nextDirection = 'right';
        score = 0;
        level = 1;
        updateScore();
        updateLevel();
        
        generateFood();
        
        // Parar loops anteriores se houver
        if (gameLogicLoop) {
            clearInterval(gameLogicLoop);
        }
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
        }
        
        // Iniciar loop do jogo
        gameRunning = true;
        gamePaused = false;
        lastUpdateTime = performance.now();
        lastRenderTime = performance.now();
        $('#game-over').removeClass('active');
        
        gameSpeed = currentDifficulty.initialSpeed;
        
        // Lógica separada da renderização
        gameLogicLoop = setInterval(updateGameLogic, gameSpeed);
        
        // Loop de renderização de alta frequência (144 fps)
        gameLoop();
        
        // Limpar efeitos
        foodEffects = [];
        effects = [];
        
        // Atualizar interface
        $('#start-button').html('<i class="fas fa-redo-alt"></i> <span>Reiniciar</span>');
        $('#pause-button').html('<i class="fas fa-pause"></i> <span>Pausar</span>');
    }
    
    // Loop principal de renderização (otimizado para 144fps)
    function gameLoop(timestamp) {
        if (!timestamp) timestamp = performance.now();
        
        // Delta time para animações independentes da taxa de quadros
        const deltaTime = timestamp - lastRenderTime;
        lastRenderTime = timestamp;
        
        // Taxa de quadros alvo de 144fps (aproximadamente 6.94ms por quadro)
        const targetFrameTime = 1000 / 144;
        
        // Calcular interpolação entre atualizações de lógica com maior precisão
        const timeSinceLastUpdate = timestamp - lastUpdateTime;
        interpolation = Math.min(1, timeSinceLastUpdate / gameSpeed);
        
        // Aplicar função de easing personalizada para movimento mais natural
        const easedInterpolation = cubicBezier(0.25, 0.1, 0.25, 1.0, interpolation);
        
        // Atualizar posições suaves da cobra com precisão sub-pixel
        updateSmoothPositions(easedInterpolation);
        
        // Atualizar ondulação da cobra
        snakeWave.offset += snakeWave.speed * (deltaTime / 16.67);
        
        // Renderizar com alta frequência e precisão
        drawGame();
        
        // Atualizar efeitos visuais com taxa independente baseada em deltaTime
        updateEffects(deltaTime / 16.67); // Normalizado para 60fps como base
        
        // Otimização para limitar o consumo de CPU
        if (gameRunning) {
            // Usar setTimeout com requestAnimationFrame para controle mais preciso da taxa
            const timeUntilNextFrame = Math.max(0, targetFrameTime - (performance.now() - timestamp));
            
            if (timeUntilNextFrame <= 1) {
                // Se estamos próximos do alvo, solicitar o próximo quadro imediatamente
                animationFrameId = requestAnimationFrame(gameLoop);
            } else {
                // Caso contrário, aguardar o tempo restante e depois solicitar
                setTimeout(() => {
                    animationFrameId = requestAnimationFrame(gameLoop);
                }, timeUntilNextFrame);
            }
        }
    }
    
    // Implementação da função Cubic Bezier para easing mais suave
    function cubicBezier(p1x, p1y, p2x, p2y, t) {
        // Baseado na implementação do CSS cubic-bezier
        if (t <= 0) return 0;
        if (t >= 1) return 1;
        
        // Cálculo polinomial Bezier
        const cx = 3 * p1x;
        const bx = 3 * (p2x - p1x) - cx;
        const ax = 1 - cx - bx;
        
        const cy = 3 * p1y;
        const by = 3 * (p2y - p1y) - cy;
        const ay = 1 - cy - by;
        
        // Refinamento de Newton-Raphson para encontrar o valor t preciso
        let x = t;
        for (let i = 0; i < 5; i++) {
            const currentX = ((ax * x + bx) * x + cx) * x;
            const currentDerivative = (3 * ax * x + 2 * bx) * x + cx;
            
            if (Math.abs(currentDerivative) < 1e-6) break;
            x = x - (currentX - t) / currentDerivative;
        }
        
        return ((ay * x + by) * x + cy) * x;
    }
    
    // Atualizar lógica do jogo (baixa frequência)
    function updateGameLogic() {
        if (gamePaused) return;
        
        lastUpdateTime = performance.now();
        
        // Atualizar direção
        direction = nextDirection;
        
        // Mover a cobra (adicionar nova cabeça na direção atual)
        const head = {x: snake[0].x, y: snake[0].y};
        
        switch (direction) {
            case 'up':
                head.y -= gridSize;
                break;
            case 'down':
                head.y += gridSize;
                break;
            case 'left':
                head.x -= gridSize;
                break;
            case 'right':
                head.x += gridSize;
                break;
        }
        
        // Verificar colisão com as bordas
        if (head.x < 0 || head.x >= canvasWidth || 
            head.y < 0 || head.y >= canvasHeight) {
            gameOver();
            return;
        }
        
        // Verificar colisão com o próprio corpo
        for (let i = 0; i < snake.length; i++) {
            if (head.x === snake[i].x && head.y === snake[i].y) {
                gameOver();
                return;
            }
        }
        
        // Adicionar nova cabeça
        snake.unshift(head);
        
        // Atualizar posições alvo para a animação suave
        targetPositions = [];
        for (let i = 0; i < snake.length; i++) {
            targetPositions.push({...snake[i]});
        }
        
        // Adicionar nova posição ao smoothSnake
        smoothSnake.unshift({...head});
        if (smoothSnake.length > snake.length) {
            smoothSnake.pop();
        }
        
        // Criar efeito visual de rastro
        createTrailEffect(head.x, head.y);
        
        // Verificar se comeu comida
        if (head.x === food.x && head.y === food.y) {
            // Incrementar pontuação
            score += pointsPerFood;
            updateScore();
            
            // Verificar level up
            checkLevelUp();
            
            // Efeito visual de comida
            createFoodEffect(food.x, food.y);
            
            // Gerar nova comida
            generateFood();
            
            // Aumentar velocidade baseado no nível
            if (level > 1 && gameSpeed > 40) {
                gameSpeed -= currentDifficulty.speedReduction;
                clearInterval(gameLogicLoop);
                gameLogicLoop = setInterval(updateGameLogic, gameSpeed);
            }
        } else {
            // Remover a cauda se não comeu
            snake.pop();
        }
        
        // Reiniciar interpolação
        interpolation = 0;
    }
    
    // Atualizar posições suaves para renderização (otimizado para 144fps)
    function updateSmoothPositions(easedInterpolation) {
        // Se não houver alvos suficientes, não fazer nada
        if (targetPositions.length === 0) return;
        
        // Histórico de posições para trail mais avançado
        const positionHistory = [];
        
        // Aplicar interpolação em cada segmento da cobra com cálculos sub-pixel
        for (let i = 0; i < smoothSnake.length; i++) {
            if (i < targetPositions.length) {
                const target = targetPositions[i];
                const current = smoothSnake[i];
                
                // Armazenar posição atual antes da atualização para o histórico
                positionHistory.push({x: current.x, y: current.y});
                
                // Calcular segmento da cobra com base na posição no array
                // Cabeça mais responsiva, corpo com atraso progressivo
                const segmentDelay = i * 0.15; // Atraso progressivo para criar efeito de "onda"
                const segmentInterpolation = Math.max(0, easedInterpolation - segmentDelay);
                
                // Aplicar spring physics para movimento mais natural
                const springFactor = 0.85 - (i * 0.02); // Diminui progressivamente para a cauda
                
                // Cálculo de interpolação avançado com spring dynamics
                if (i === 0) {
                    // A cabeça é mais direta e responsiva
                    current.x = current.x + (target.x - current.x) * easedInterpolation;
                    current.y = current.y + (target.y - current.y) * easedInterpolation;
                } else {
                    // O corpo tem um movimento mais orgânico com "spring physics"
                    // Calcular vetor para o alvo
                    const dx = target.x - current.x;
                    const dy = target.y - current.y;
                    
                    // Distância ao alvo
                    const distance = Math.sqrt(dx*dx + dy*dy);
                    
                    if (distance > 0.01) {
                        // Aplicar spring physics com damping
                        const velocityX = dx * springFactor * segmentInterpolation;
                        const velocityY = dy * springFactor * segmentInterpolation;
                        
                        // Movimento suave com spring physics
                        current.x += velocityX;
                        current.y += velocityY;
                        
                        // Implementar amortecimento para evitar oscilações
                        if (Math.abs(dx) < 0.5) current.x = target.x;
                        if (Math.abs(dy) < 0.5) current.y = target.y;
                    }
                }
            }
        }
        
        // Adicionar segmentos intermediários para snake mais suave
        if (smoothSnake.length >= 2 && smoothSnake.length < 10) {
            for (let i = 0; i < smoothSnake.length - 1; i++) {
                const curr = smoothSnake[i];
                const next = smoothSnake[i+1];
                
                // Distância entre segmentos
                const dx = next.x - curr.x;
                const dy = next.y - curr.y;
                const distance = Math.sqrt(dx*dx + dy*dy);
                
                // Se os segmentos estão muito afastados, adicionar segmento intermediário
                if (distance > gridSize * 1.2) {
                    // Criar ponto intermediário
                    const midX = curr.x + dx * 0.5;
                    const midY = curr.y + dy * 0.5;
                    
                    // Inserir novo segmento na cobra
                    smoothSnake.splice(i+1, 0, {x: midX, y: midY});
                    i++; // Pular o novo segmento
                }
            }
        }
        
        return positionHistory;
    }
    
    // Verificar level up
    function checkLevelUp() {
        const newLevel = Math.floor(score / 50) + 1;
        if (newLevel > level) {
            level = newLevel;
            updateLevel();
        }
    }
    
    // Atualizar nível
    function updateLevel() {
        $('#level-display').text(level);
        $('#level-badge-display').text(level);
        
        // Animar badge
        $('.level-badge').css('background', '#fc6426');
        $('.level-badge').css('color', 'white');
        
        setTimeout(() => {
            $('.level-badge').css('background', 'rgba(20, 20, 20, 0.85)');
            $('.level-badge').css('color', 'var(--primary)');
        }, 1000);
    }
    
    // Criar efeito avançado para comida
    function createFoodEffect(x, y) {
        const effectColors = ['#fc6426', '#e2a928', '#ffffff', '#e14d0d', '#e5bcd6'];
        const originalFoodColor = colors.food;
        
        // Número de partículas dependente do nível para escalar efeito
        const particleCount = 15 + Math.min(15, level * 2);
        
        // Adicionar explosão principal
        for (let i = 0; i < particleCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * 20 + 10;
            const speed = Math.random() * 3 + 1;
            const size = Math.random() * 6 + 3;
            
            // Variação de cor baseada na cor da comida
            let particleColor;
            if (Math.random() < 0.6) {
                // Usar cor da comida com variação de brilho
                const brightnessVariation = Math.random() * 50 - 25;
                particleColor = adjustBrightness(originalFoodColor, brightnessVariation);
            } else {
                // Usar uma cor aleatória da paleta
                particleColor = effectColors[Math.floor(Math.random() * effectColors.length)];
            }
            
            foodEffects.push({
                x: x + gridSize/2,
                y: y + gridSize/2,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                initialVx: Math.cos(angle) * speed, // Para cálculos de física
                initialVy: Math.sin(angle) * speed, // Para cálculos de física
                radius: size,
                initialRadius: size, // Tamanho inicial para escala
                color: particleColor,
                alpha: 1,
                life: 30 + Math.random() * 20,
                rotation: Math.random() * 360, // Ângulo de rotação para partículas não circulares
                rotationSpeed: (Math.random() - 0.5) * 10, // Velocidade de rotação
                shape: Math.random() < 0.7 ? 'circle' : 'square' // Variação de forma
            });
        }
        
        // Adicionar anel de explosão
        const ringParticles = 20;
        const ringRadius = gridSize;
        for (let i = 0; i < ringParticles; i++) {
            const angle = (i / ringParticles) * Math.PI * 2;
            foodEffects.push({
                x: x + gridSize/2 + Math.cos(angle) * ringRadius * 0.5,
                y: y + gridSize/2 + Math.sin(angle) * ringRadius * 0.5,
                vx: Math.cos(angle) * 2,
                vy: Math.sin(angle) * 2,
                radius: 2,
                color: originalFoodColor,
                alpha: 1,
                life: 15,
                shape: 'circle'
            });
        }
        
        // Função para ajustar brilho de uma cor hex
        function adjustBrightness(hex, percent) {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            
            const newR = Math.min(255, Math.max(0, r + percent));
            const newG = Math.min(255, Math.max(0, g + percent));
            const newB = Math.min(255, Math.max(0, b + percent));
            
            return `#${Math.round(newR).toString(16).padStart(2, '0')}${Math.round(newG).toString(16).padStart(2, '0')}${Math.round(newB).toString(16).padStart(2, '0')}`;
        }
    }
    
    // Criar efeito de rastro avançado
    function createTrailEffect(x, y) {
        effects.push({
            x: x + gridSize/2,
            y: y + gridSize/2,
            size: gridSize,
            initialSize: gridSize,
            alpha: 0.5,
            life: 10,
            color: colors.snake, // Usar cor da cobra
            // Adicionar variação sutil para efeito mais orgânico
            offsetX: (Math.random() - 0.5) * 4,
            offsetY: (Math.random() - 0.5) * 4
        });
    }
    
    // Atualizar efeitos visuais (otimizado para 144fps)
    function updateEffects(timeScale = 1) {
        // Atualizar partículas de comida com tempo independente da taxa de quadros
        for (let i = foodEffects.length - 1; i >= 0; i--) {
            const effect = foodEffects[i];
            
            // Aplicar velocidade escalonada pelo delta time
            effect.x += effect.vx * timeScale;
            effect.y += effect.vy * timeScale;
            
            // Adicionar aceleração e física realista
            effect.vx *= 0.98; // Atrito do ar
            effect.vy *= 0.98; // Atrito do ar
            effect.vy += 0.05 * timeScale; // Gravidade suave
            
            // Reduzir vida com base no tempo
            effect.life -= 1 * timeScale;
            effect.alpha = effect.life / 30;
            
            // Efeito de rotação
            effect.rotation = (effect.rotation || 0) + effect.rotationSpeed * timeScale;
            
            // Remover quando a vida acabar
            if (effect.life <= 0) {
                foodEffects.splice(i, 1);
            }
        }
        
        // Atualizar efeitos de rastro com escala de tempo
        for (let i = effects.length - 1; i >= 0; i--) {
            const effect = effects[i];
            effect.life -= 1 * timeScale;
            effect.alpha = effect.life / 10;
            
            // Expansão suave do efeito
            effect.size = Math.max(1, effect.initialSize * (1 + (10 - effect.life) / 10));
            
            if (effect.life <= 0) {
                effects.splice(i, 1);
            }
        }
        
        // Limitar o número de efeitos para performance
        if (effects.length > 100) {
            effects.splice(0, effects.length - 100);
        }
        if (foodEffects.length > 50) {
            foodEffects.splice(0, foodEffects.length - 50);
        }
    }
    
    // Desenhar o jogo na tela
    function drawGame() {
        // Limpar tela
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        
        // Desenhar efeitos de rastro com alta qualidade
        for (const effect of effects) {
            // Usar a cor da cobra com transparência
            const trailColor = hex2rgba(effect.color || colors.snake, effect.alpha);
            
            // Adicionar glow effect
            ctx.shadowColor = hex2rgba(effect.color || colors.snake, effect.alpha * 0.7);
            ctx.shadowBlur = 10;
            
            // Desenhar como gradiente circular para efeito mais suave
            const gradient = ctx.createRadialGradient(
                effect.x + effect.offsetX, 
                effect.y + effect.offsetY, 
                0,
                effect.x + effect.offsetX, 
                effect.y + effect.offsetY, 
                effect.size / 2
            );
            
            gradient.addColorStop(0, hex2rgba(effect.color || colors.snake, effect.alpha));
            gradient.addColorStop(1, 'rgba(252, 100, 38, 0)');
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(
                effect.x + effect.offsetX, 
                effect.y + effect.offsetY, 
                effect.size / 2, 
                0, 
                Math.PI * 2
            );
            ctx.fill();
            
            // Resetar sombra
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
        }
        
        // Desenhar cobra com posições suaves
        for (let i = 0; i < smoothSnake.length; i++) {
            // Cor gradiente para a cobra
            const progress = i / smoothSnake.length;
            
            // Cor principal da cobra (vem das configurações)
            const snakeColor = i === 0 ? colors.snakeHead : colors.snake;
            
            // Desenhar segmento
            ctx.fillStyle = snakeColor;
            
            // Obter posição suave
            const x = smoothSnake[i].x;
            const y = smoothSnake[i].y;
            const size = gridSize;
            
            // Para a cabeça, desenhar um círculo mais elaborado
            if (i === 0) {
                ctx.beginPath();
                ctx.arc(x + size/2, y + size/2, size/2, 0, Math.PI * 2);
                ctx.fill();
                
                // Adicionar sombra à cabeça para efeito 3D
                ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
                ctx.shadowBlur = 10;
                ctx.shadowOffsetX = 2;
                ctx.shadowOffsetY = 2;
                
                // Adicionar brilho na cabeça
                const gradient = ctx.createRadialGradient(
                    x + size/2, y + size/2, 0,
                    x + size/2, y + size/2, size/2
                );
                gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
                gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.1)');
                gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
                
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(x + size/2, y + size/2, size/2, 0, Math.PI * 2);
                ctx.fill();
                
                // Resetar sombra
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
                
                // Olhos
                ctx.fillStyle = "white";
                
                // Calcular ângulo da cabeça baseado na direção
                let eyeAngle = 0;
                if (direction === 'right') eyeAngle = 0;
                else if (direction === 'left') eyeAngle = Math.PI;
                else if (direction === 'up') eyeAngle = -Math.PI/2;
                else if (direction === 'down') eyeAngle = Math.PI/2;
                
                // Posições dos olhos com animação suave
                const eyeRadius = size * 0.3;
                let leftEyeX = x + size/2 + Math.cos(eyeAngle - 0.4) * eyeRadius;
                let leftEyeY = y + size/2 + Math.sin(eyeAngle - 0.4) * eyeRadius;
                let rightEyeX = x + size/2 + Math.cos(eyeAngle + 0.4) * eyeRadius;
                let rightEyeY = y + size/2 + Math.sin(eyeAngle + 0.4) * eyeRadius;
                
                // Olhos com sombra
                ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
                ctx.shadowBlur = 3;
                
                // Desenhar olhos com efeito de brilho
                const eyeSize = size/6;
                
                ctx.beginPath();
                ctx.arc(leftEyeX, leftEyeY, eyeSize, 0, Math.PI * 2);
                ctx.fill();
                
                ctx.beginPath();
                ctx.arc(rightEyeX, rightEyeY, eyeSize, 0, Math.PI * 2);
                ctx.fill();
                
                // Resetar sombra
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                
                // Pupila
                ctx.fillStyle = "black";
                
                // Animação da pupila baseada na direção de movimento
                const pupilOffset = size/15;
                const pupilX = Math.cos(eyeAngle) * pupilOffset;
                const pupilY = Math.sin(eyeAngle) * pupilOffset;
                
                ctx.beginPath();
                ctx.arc(leftEyeX + pupilX, leftEyeY + pupilY, eyeSize/2, 0, Math.PI * 2);
                ctx.fill();
                
                ctx.beginPath();
                ctx.arc(rightEyeX + pupilX, rightEyeY + pupilY, eyeSize/2, 0, Math.PI * 2);
                ctx.fill();
                
                // Brilho nos olhos
                ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
                ctx.beginPath();
                ctx.arc(leftEyeX - eyeSize/3, leftEyeY - eyeSize/3, eyeSize/4, 0, Math.PI * 2);
                ctx.fill();
                
                ctx.beginPath();
                ctx.arc(rightEyeX - eyeSize/3, rightEyeY - eyeSize/3, eyeSize/4, 0, Math.PI * 2);
                ctx.fill();
            } else {
                // Corpo da cobra com gradiente para a cauda
                const alpha = 1 - (i / smoothSnake.length) * 0.6;
                ctx.fillStyle = hex2rgba(colors.snake, alpha);
                
                // Calcular tamanho baseado na posição (menor na cauda)
                const segmentSize = size/2 - (i / smoothSnake.length) * 5;
                
                // Adicionar sombra suave aos segmentos
                ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
                ctx.shadowBlur = 5;
                ctx.shadowOffsetX = 1;
                ctx.shadowOffsetY = 1;
                
                ctx.beginPath();
                ctx.arc(x + size/2, y + size/2, segmentSize, 0, Math.PI * 2);
                ctx.fill();
                
                // Resetar sombra
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
                
                // Adicionar brilho sutil
                ctx.fillStyle = `rgba(255, 255, 255, ${0.2 - (i / smoothSnake.length) * 0.2})`;
                ctx.beginPath();
                ctx.arc(x + size/2 - segmentSize/4, y + size/2 - segmentSize/4, segmentSize/3, 0, Math.PI * 2);
                ctx.fill();
            }
            
            // Conectar segmentos com curvas para maior fluidez (apenas para segmentos adjacentes)
            if (i > 0 && i < smoothSnake.length) {
                const prev = smoothSnake[i-1];
                const curr = smoothSnake[i];
                
                // Apenas desenhar conectores se houver uma distância visível
                const dx = prev.x - curr.x;
                const dy = prev.y - curr.y;
                const distance = Math.sqrt(dx*dx + dy*dy);
                
                if (distance > gridSize * 0.3 && distance < gridSize * 1.5) {
                    const prevRadius = (i-1 === 0) ? size/2 : size/2 - ((i-1) / smoothSnake.length) * 5;
                    const currRadius = size/2 - (i / smoothSnake.length) * 5;
                    
                    // Desenhar conector
                    ctx.fillStyle = hex2rgba(colors.snake, 0.8 - (i / smoothSnake.length) * 0.4);
                    
                    // Calcular pontos de controle para a curva
                    const angle = Math.atan2(dy, dx);
                    const midX = (prev.x + curr.x) / 2;
                    const midY = (prev.y + curr.y) / 2;
                    
                    // Desenhar conexão curva
                    ctx.beginPath();
                    ctx.arc(prev.x + size/2, prev.y + size/2, prevRadius, 0, Math.PI * 2);
                    ctx.arc(curr.x + size/2, curr.y + size/2, currRadius, 0, Math.PI * 2);
                    
                    // Desenhar retângulo curvo entre segmentos
                    const ctrlX = midX + Math.cos(angle + Math.PI/2) * gridSize/4;
                    const ctrlY = midY + Math.sin(angle + Math.PI/2) * gridSize/4;
                    
                    ctx.moveTo(prev.x + size/2 + Math.cos(angle) * prevRadius,
                              prev.y + size/2 + Math.sin(angle) * prevRadius);
                    ctx.quadraticCurveTo(ctrlX, ctrlY,
                                       curr.x + size/2 - Math.cos(angle) * currRadius,
                                       curr.y + size/2 - Math.sin(angle) * currRadius);
                    ctx.fill();
                }
            }
        }
        
        // Desenhar comida (círculo pulsante)
        ctx.fillStyle = colors.food;
        ctx.beginPath();
        
        // Efeito pulsante para a comida
        const pulseScale = 1 + Math.sin(Date.now() / 200) * 0.1;
        
        // Adicionar sombra de brilho para a comida
        ctx.shadowColor = colors.food;
        ctx.shadowBlur = 15;
        
        ctx.arc(
            food.x + gridSize/2, 
            food.y + gridSize/2, 
            gridSize/2 * pulseScale, 
            0, 
            Math.PI * 2
        );
        ctx.fill();
        
        // Brilho na comida
        ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
        ctx.beginPath();
        ctx.arc(
            food.x + gridSize/2 - gridSize/5, 
            food.y + gridSize/2 - gridSize/5, 
            gridSize/6, 
            0, 
            Math.PI * 2
        );
        ctx.fill();
        
        // Resetar sombra
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        
        // Desenhar efeitos de partículas com alta performance
        for (const effect of foodEffects) {
            ctx.save();
            ctx.globalAlpha = effect.alpha;
            
            // Transformar contexto para rotação
            ctx.translate(effect.x, effect.y);
            if (effect.rotation) {
                ctx.rotate(effect.rotation * Math.PI / 180);
            }
            
            // Aplicar sombra para efeito de brilho
            ctx.shadowColor = effect.color;
            ctx.shadowBlur = effect.radius * 2;
            ctx.fillStyle = effect.color;
            
            // Renderizar forma com base no tipo
            if (effect.shape === 'square') {
                const size = effect.radius * 1.5;
                ctx.fillRect(-size/2, -size/2, size, size);
            } else if (effect.shape === 'star' && effect.radius > 3) {
                // Desenhar estrela
                const spikes = 5;
                const outerRadius = effect.radius;
                const innerRadius = effect.radius / 2;
                
                ctx.beginPath();
                for (let i = 0; i < spikes * 2; i++) {
                    const radius = i % 2 === 0 ? outerRadius : innerRadius;
                    const angle = (Math.PI / spikes) * i;
                    const x = Math.cos(angle) * radius;
                    const y = Math.sin(angle) * radius;
                    
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.closePath();
                ctx.fill();
            } else {
                // Círculo padrão
                ctx.beginPath();
                ctx.arc(0, 0, effect.radius, 0, Math.PI * 2);
                ctx.fill();
                
                // Adicionar brilho interno
                ctx.globalAlpha = effect.alpha * 0.5;
                ctx.fillStyle = 'white';
                ctx.beginPath();
                ctx.arc(0, 0, effect.radius * 0.5, 0, Math.PI * 2);
                ctx.fill();
            }
            
            ctx.restore();
        }
    }
    
    // Função para converter hex para rgba
    function hex2rgba(hex, alpha = 1) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    
    // Gerar comida em posição aleatória
    function generateFood() {
        let newFood;
        let foodOnSnake;
        
        // Garantir que a comida não apareça sobre a cobra
        do {
            foodOnSnake = false;
            newFood = {
                x: Math.floor(Math.random() * (canvasWidth / gridSize)) * gridSize,
                y: Math.floor(Math.random() * (canvasHeight / gridSize)) * gridSize
            };
            
            // Verificar se a nova comida está sobre a cobra
            for (let i = 0; i < snake.length; i++) {
                if (newFood.x === snake[i].x && newFood.y === snake[i].y) {
                    foodOnSnake = true;
                    break;
                }
            }
        } while (foodOnSnake);
        
        food = newFood;
    }
    
    // Atualizar pontuação
    function updateScore() {
        $('#score-display').text(score);
        $('#final-score').text(score);
        
        // Atualizar high score se necessário
        if (score > highScore) {
            highScore = score;
            $('#high-score-value').text(highScore);
            localStorage.setItem('snakeHighScore', highScore);
        }
    }
    
    // Aplicar configurações
    function applySettings() {
        // Obter valores dos controles
        const difficulty = $('#difficulty-select').val();
        const snakeColor = $('#snake-color').val();
        const foodColor = $('#food-color').val();
        const boardSize = $('#board-size').val();
        
        // Aplicar dificuldade
        currentDifficulty = difficulties[difficulty];
        pointsPerFood = currentDifficulty.pointsPerFood;
        
        // Aplicar cores
        colors.snake = snakeColor;
        colors.snakeHead = adjustColor(snakeColor, -20);
        colors.food = foodColor;
        
        // Aplicar tamanho do tabuleiro
        let size;
        if (boardSize === 'small') {
            size = 400;
            gridSize = 20;
        } else if (boardSize === 'medium') {
            size = 500;
            gridSize = 20;
        } else if (boardSize === 'large') {
            size = 600;
            gridSize = 20;
        }
        
        // Atualizar tamanho do canvas
        canvas.width = size;
        canvas.height = size;
        canvasWidth = size;
        canvasHeight = size;
        $('#game-container').css('width', size + 'px');
        $('#game-container').css('height', size + 'px');
    }
    
    // Ajustar cor (escurecer/clarear)
    function adjustColor(hex, amount) {
        return '#' + hex.replace(/^#/, '').replace(/../g, color => 
            ('0' + Math.min(255, Math.max(0, parseInt(color, 16) + amount))
            .toString(16)).substr(-2));
    }
    
    // Fim de jogo
    function gameOver() {
        gameRunning = false;
        clearInterval(gameLogicLoop);
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
        }
        $('#game-over').addClass('active');
        $('#start-button').html('<i class="fas fa-play"></i> <span>Iniciar Jogo</span>');
    }
    
    // Controles de teclado
    $(document).keydown(function(e) {
        // Impedir que as setas afetem a rolagem da página
        if ([37, 38, 39, 40, 65, 68, 83, 87].indexOf(e.keyCode) > -1) {
            e.preventDefault();
        }
        
        if (!gameRunning || gamePaused) return;
        
        switch (e.keyCode) {
            case 38: // Seta para cima
            case 87: // Tecla W
                if (direction !== 'down') {
                    nextDirection = 'up';
                }
                break;
            case 40: // Seta para baixo
            case 83: // Tecla S
                if (direction !== 'up') {
                    nextDirection = 'down';
                }
                break;
            case 37: // Seta para esquerda
            case 65: // Tecla A
                if (direction !== 'right') {
                    nextDirection = 'left';
                }
                break;
            case 39: // Seta para direita
            case 68: // Tecla D
                if (direction !== 'left') {
                    nextDirection = 'right';
                }
                break;
        }
    });
    
    // Controles para dispositivos móveis
    $('.up-btn').on('touchstart mousedown', function() {
        if (direction !== 'down') {
            nextDirection = 'up';
        }
    });
    
    $('.down-btn').on('touchstart mousedown', function() {
        if (direction !== 'up') {
            nextDirection = 'down';
        }
    });
    
    $('.left-btn').on('touchstart mousedown', function() {
        if (direction !== 'right') {
            nextDirection = 'left';
        }
    });
    
    $('.right-btn').on('touchstart mousedown', function() {
        if (direction !== 'left') {
            nextDirection = 'right';
        }
    });
    
    // Botões de controle do jogo
    $('#start-button').click(function() {
        initGame();
    });
    
    $('#pause-button').click(function() {
        if (!gameRunning) return;
        
        gamePaused = !gamePaused;
        $(this).html(gamePaused ? 
            '<i class="fas fa-play"></i> <span>Continuar</span>' : 
            '<i class="fas fa-pause"></i> <span>Pausar</span>');
        
        // Se estiver despausando, atualizar timestamp para evitar saltos
        if (!gamePaused) {
            lastUpdateTime = performance.now();
        }
    });
    
    $('#restart-button').click(function() {
        initGame();
    });
    
    $('#settings-button').click(function() {
        $('.settings-panel').slideToggle(300);
    });
    
    // Atualizar configurações
    $('#difficulty-select, #snake-color, #food-color, #board-size').change(function() {
        if (gameRunning) {
            if (confirm('Alterar configurações reiniciará o jogo. Continuar?')) {
                initGame();
            }
        }
    });
    
    // Inicialização
    $('.settings-panel').hide();
    drawGame();
});