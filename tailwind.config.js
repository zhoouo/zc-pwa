/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      colors: {
        paper: '#f5efe6',
        shell: '#ebe0d2',
        ink: '#241f1a',
        mist: '#fff9f2',
        gold: '#b28a5c',
        sage: '#89907d'
      },
      boxShadow: {
        glass: 'none',
        line: 'none'
      },
      fontFamily: {
        serif: ['"Noto Serif TC"', 'serif']
      },
      backgroundImage: {
        mesh: 'radial-gradient(circle at top, rgba(255,255,255,0.6), rgba(245,239,230,0) 52%), radial-gradient(circle at bottom right, rgba(178,138,92,0.12), rgba(245,239,230,0) 38%)'
      }
    }
  },
  plugins: []
}
