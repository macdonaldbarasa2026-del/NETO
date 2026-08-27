const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
  'const ctx = new AudioContext(); micContextRef.current = ctx; await ctx.resume();',
  'const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 }); micContextRef.current = ctx; await ctx.resume();'
);

code = code.replace(
  /const input = event\.inputBuffer\.getChannelData\(0\);.*?binary \+= String\.fromCharCode\(\.\.\.bytes\.subarray\(i,i\+step\)\);/s,
  `const input = event.inputBuffer.getChannelData(0);
        const pcm = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
          pcm[i] = Math.max(-1, Math.min(1, input[i])) * 32767;
        }
        let binary = "";
        const bytes = new Uint8Array(pcm.buffer);
        const step = 0x8000;
        for (let i = 0; i < bytes.length; i += step) {
          binary += String.fromCharCode(...bytes.subarray(i, i + step));
        }`
);

fs.writeFileSync('src/App.tsx', code);
