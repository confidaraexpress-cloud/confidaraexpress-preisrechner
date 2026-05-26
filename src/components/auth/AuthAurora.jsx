import React from "react";

export function AuthAurora() {
  return (
    <div className="auth-aurora" aria-hidden="true">
      <div className="auth-aurora-sun" />
      <div className="auth-aurora-ray-top" />
      <div className="auth-aurora-ray-right" />

      <div className="auth-aurora-wave">
        <svg viewBox="0 0 1100 700" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="ribbonA" x1="0%" y1="50%" x2="100%" y2="50%">
              <stop offset="0%"   stopColor="#ffffff" stopOpacity="0" />
              <stop offset="20%"  stopColor="#cfe1ff" stopOpacity="0.65" />
              <stop offset="55%"  stopColor="#a8c4ff" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#5a86ff" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="ribbonB" x1="0%" y1="50%" x2="100%" y2="50%">
              <stop offset="0%"   stopColor="#a8c4ff" stopOpacity="0" />
              <stop offset="50%"  stopColor="#dde9ff" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#5a86ff" stopOpacity="0" />
            </linearGradient>
            <filter id="blurA" x="-10%" y="-50%" width="120%" height="200%">
              <feGaussianBlur stdDeviation="2" />
            </filter>
            <filter id="blurB" x="-10%" y="-50%" width="120%" height="200%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
          </defs>
          <path
            d="M-50 540 C 180 460, 320 380, 540 360 C 720 345, 880 320, 1100 250"
            stroke="url(#ribbonA)" strokeWidth="1.5" fill="none"
            filter="url(#blurA)"
          />
          <path
            d="M-50 620 C 200 540, 360 470, 600 450 C 800 435, 950 410, 1100 360"
            stroke="url(#ribbonA)" strokeWidth="1.2" fill="none" opacity="0.75"
            filter="url(#blurA)"
          />
          <path
            d="M-50 560 C 220 480, 380 410, 600 390 C 800 375, 950 350, 1100 290"
            stroke="url(#ribbonB)" strokeWidth="60" fill="none" opacity="0.35"
            filter="url(#blurB)"
          />
          <path
            d="M-50 460 C 220 380, 360 320, 580 300"
            stroke="url(#ribbonA)" strokeWidth="0.8" fill="none" opacity="0.55"
            filter="url(#blurA)"
          />
        </svg>
      </div>

      <div className="auth-aurora-dust" />
      <div className="auth-aurora-vignette" />
    </div>
  );
}
