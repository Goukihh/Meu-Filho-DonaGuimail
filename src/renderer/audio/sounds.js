/* ===== SISTEMA DE SONS ELEGANTES ===== */
/* Sons sutis e sofisticados para o Meu Filho */

class AudioManager {
    constructor() {
        this.audioContext = null;
        this.masterVolume = 0.1; // Volume muito baixo e confortável
        this.sounds = {};
        this.initializeAudio();
    }

    initializeAudio() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.createSounds();
        } catch (error) {
            console.log('Audio não suportado neste navegador');
        }
    }

    createSounds() {
        // Som de hover muito suave - tom baixo e confortável
        this.sounds.hover = this.createTone(200, 0.05, 'sine', 0.08);
        
        // Som de clique discreto - tom baixo e suave
        this.sounds.click = this.createTone(150, 0.03, 'sine', 0.1);
        
        // Som de transição suave - glissando baixo
        this.sounds.transition = this.createGlissando(120, 200, 0.15);
        
        // Som de notificação muito suave - acorde baixo
        this.sounds.notification = this.createChord([130, 165, 196], 0.2);
        
        // Som de sucesso discreto - tom baixo
        this.sounds.success = this.createTone(220, 0.1, 'sine', 0.12);
        
        // Som de erro suave - tom baixo
        this.sounds.error = this.createTone(100, 0.15, 'sine', 0.1);
    }

    createTone(frequency, duration, waveType = 'sine', volume = 0.1) {
        return () => {
            if (!this.audioContext) return;
            
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
            oscillator.type = waveType;
            
            // Envelope muito suave com fade in/out longo
            gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(volume * this.masterVolume, this.audioContext.currentTime + 0.02);
            gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);
            
            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + duration);
        };
    }

    createGlissando(startFreq, endFreq, duration) {
        return () => {
            if (!this.audioContext) return;
            
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            oscillator.type = 'sine';
            
            // Glissando muito suave
            oscillator.frequency.setValueAtTime(startFreq, this.audioContext.currentTime);
            oscillator.frequency.linearRampToValueAtTime(endFreq, this.audioContext.currentTime + duration);
            
            // Envelope muito suave
            gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.05 * this.masterVolume, this.audioContext.currentTime + 0.03);
            gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);
            
            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + duration);
        };
    }

    createChord(frequencies, duration) {
        return () => {
            if (!this.audioContext) return;
            
            frequencies.forEach(freq => {
                const oscillator = this.audioContext.createOscillator();
                const gainNode = this.audioContext.createGain();
                
                oscillator.connect(gainNode);
                gainNode.connect(this.audioContext.destination);
                
                oscillator.frequency.setValueAtTime(freq, this.audioContext.currentTime);
                oscillator.type = 'sine';
                
                // Envelope harmonioso
                gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
                gainNode.gain.linearRampToValueAtTime(0.08 * this.masterVolume, this.audioContext.currentTime + 0.01);
                gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);
                
                oscillator.start(this.audioContext.currentTime);
                oscillator.stop(this.audioContext.currentTime + duration);
            });
        };
    }

    // Métodos para tocar sons
    playHover() {
        this.sounds.hover?.();
    }

    playClick() {
        this.sounds.click?.();
    }

    playTransition() {
        this.sounds.transition?.();
    }

    playNotification() {
        this.sounds.notification?.();
    }

    playSuccess() {
        this.sounds.success?.();
    }

    playError() {
        this.sounds.error?.();
    }

    // Controle de volume
    setVolume(volume) {
        this.masterVolume = Math.max(0, Math.min(1, volume));
    }

    getVolume() {
        return this.masterVolume;
    }
}

// Instância global
window.audioManager = new AudioManager();

// Exportar para uso em outros módulos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioManager;
}
