import { motion, useMotionValue, useMotionTemplate, useSpring } from 'framer-motion';

export default function SpotlightCard({ children, className, glowColor = "rgba(255,255,255,0.05)", onClick, layout, initial, animate, exit }) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  // Плавні пружини як у Accounts
  const rotateX = useSpring(0, { stiffness: 200, damping: 25, mass: 0.5 });
  const rotateY = useSpring(0, { stiffness: 200, damping: 25, mass: 0.5 });

  function handleMouseMove({ currentTarget, clientX, clientY }) {
    const { left, top, width, height } = currentTarget.getBoundingClientRect();
    const localX = clientX - left;
    const localY = clientY - top;
    
    mouseX.set(localX);
    mouseY.set(localY);

    const maxRotate = 5; 
    const px = Math.max(-1, Math.min(1, (localX / width) * 2 - 1));
    const py = Math.max(-1, Math.min(1, (localY / height) * 2 - 1));

    rotateX.set(-py * maxRotate);
    rotateY.set(px * maxRotate);
  }

  function handleMouseLeave() {
    rotateX.set(0);
    rotateY.set(0);
  }

  return (
    <motion.div
      layout={layout}
      initial={initial}
      animate={animate}
      exit={exit}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ perspective: 1200 }}
      className="relative group cursor-pointer w-full h-full"
    >
      <motion.div
        style={{ rotateX, rotateY, transformPerspective: 1200 }}
        className={`relative w-full h-full ${className}`}
      >
        <motion.div
          className="pointer-events-none absolute -inset-px z-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 rounded-[inherit]"
          style={{
            background: useMotionTemplate`radial-gradient(500px circle at ${mouseX}px ${mouseY}px, ${glowColor}, transparent 80%)`,
          }}
        />
        {children}
      </motion.div>
    </motion.div>
  );
}