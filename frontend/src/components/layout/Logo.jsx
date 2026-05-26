import React, { useEffect, useRef } from "react";
import anime from "animejs";

export function Logo({ className = "" }) {
  const line1Ref = useRef(null);
  const line2Ref = useRef(null);
  const headRef = useRef(null);
  const eyesRef = useRef(null);
  const filamentRef = useRef(null);

  useEffect(() => {
    // Hide lines initially
    if (line1Ref.current && line2Ref.current) {
      line1Ref.current.style.strokeDasharray = anime.setDashoffset(line1Ref.current);
      line1Ref.current.style.strokeDashoffset = anime.setDashoffset(line1Ref.current);
      line2Ref.current.style.strokeDasharray = anime.setDashoffset(line2Ref.current);
      line2Ref.current.style.strokeDashoffset = anime.setDashoffset(line2Ref.current);
    }

    const tl = anime.timeline({
      loop: false, // Halt without looping
    });

    // Start head position for first line (x=65)
    anime.set(headRef.current, {
      translateX: -35,
      translateY: 0
    });

    // Extrude Line 1 (Top line: x=65 to x=135)
    tl.add({
      targets: headRef.current,
      translateX: 35,
      duration: 500,
      easing: 'easeOutSine'
    }, 200)
    .add({
      targets: line1Ref.current,
      strokeDashoffset: [anime.setDashoffset, 0],
      duration: 500,
      easing: 'easeOutSine'
    }, '-=500')
    
    // Shift head to the start of Line 2 (x=120)
    .add({
      targets: headRef.current,
      translateX: 20,
      translateY: 15,
      duration: 150,
      easing: 'easeInOutQuad'
    })

    // Extrude Line 2 backwards (Right to Left: x=120 to x=80)
    .add({
      targets: headRef.current,
      translateX: -20,
      duration: 400,
      easing: 'easeOutSine'
    })
    .add({
      targets: line2Ref.current,
      strokeDashoffset: [anime.setDashoffset, 0],
      duration: 400,
      easing: 'easeOutSine'
    }, '-=400')

    // Filament is sharply retracted/sipped back into the nozzle
    .add({
      targets: filamentRef.current,
      scaleY: [1, 0],
      duration: 200,
      easing: 'easeInExpo'
    }, '+=50')
    
    // Head moves back to center position
    .add({
      targets: headRef.current,
      translateX: 0,
      translateY: 0,
      duration: 400,
      easing: 'easeOutBack'
    }, '+=50')

    // Eyes blink once
    .add({
      targets: eyesRef.current.children,
      scaleY: [
        { value: 0.1, duration: 100, easing: 'easeOutQuad' },
        { value: 1, duration: 100, easing: 'easeInQuad' }
      ]
    }, '+=100');

    return () => {
      tl.pause();
    };
  }, []);

  return (
    <svg 
      viewBox="60 68 80 90" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      style={{ overflow: 'visible' }}
    >
        {/* Printed Lines */}
        <path ref={line1Ref} d="M 65 140 L 135 140" stroke="#3379D5" strokeWidth="6" strokeLinecap="round" fill="none" />
        <path ref={line2Ref} d="M 120 155 L 80 155" stroke="#3379D5" strokeWidth="6" strokeLinecap="round" fill="none" />

        {/* Moving Robot Head */}
        <g ref={headRef}>
            <rect x="75" y="70" width="50" height="45" rx="14" fill="#3379D5" />
            <rect x="83" y="78" width="34" height="20" rx="6" fill="#2859A5" />
            <g ref={eyesRef}>
                <rect x="89" y="83" width="8" height="8" rx="3" fill="white" style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />
                <rect x="103" y="83" width="8" height="8" rx="3" fill="white" style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />
            </g>
            <path d="M 90 115 L 95 125 L 105 125 L 110 115 Z" fill="#3379D5" />
            {/* Filament inside nozzle */}
            <rect ref={filamentRef} x="98" y="125" width="4" height="20" fill="#3379D5" opacity="0.8" style={{ transformBox: 'fill-box', transformOrigin: 'top' }} />
        </g>
    </svg>
  );
}
