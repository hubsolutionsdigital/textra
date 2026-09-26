import confetti from 'canvas-confetti';

export function celebrate() {
  const end = Date.now() + 1500;
  const colors = ['#6d5efc', '#ff6b8b', '#ffc93c', '#2ec4b6'];
  (function frame() {
    confetti({ particleCount: 4, angle: 60, spread: 60, origin: { x: 0 }, colors });
    confetti({ particleCount: 4, angle: 120, spread: 60, origin: { x: 1 }, colors });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
  confetti({ particleCount: 120, spread: 90, origin: { y: 0.6 }, colors });
}
