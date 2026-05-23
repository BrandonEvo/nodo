/** @type {import('tailwindcss').Config} */
export default {
    darkMode: ["class"],
    content: [
      "./index.html",
      "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
    	extend: {
    		borderRadius: {
    			lg: 'var(--radius)',
    			md: 'calc(var(--radius) - 2px)',
    			sm: 'calc(var(--radius) - 4px)'
    		},
    		colors: {
    			brand: '#69E7A8',
    			// ink y surface ahora son dark-mode aware vía CSS vars
    			ink: 'var(--nodo-ink)',
    			surface: 'var(--nodo-canvas)',
    			// Nodo semantic token palette
    			nodo: {
    				accent:  'var(--tenant-color)',
    				canvas:  'var(--nodo-canvas)',
    				card:    'var(--nodo-card)',
    				inset:   'var(--nodo-inset)',
    				raised:  'var(--nodo-raised)',
    				ink:     'var(--nodo-ink)',
    				sub:     'var(--nodo-sub)',
    				dim:     'var(--nodo-dim)',
    				line:    'var(--nodo-line)',
    				'line-s':'var(--nodo-line-s)',
    				// semantic states
    				'danger-bg':  'var(--nodo-danger-bg)',
    				'danger-bd':  'var(--nodo-danger-bd)',
    				'danger-tx':  'var(--nodo-danger-tx)',
    				'success-bg': 'var(--nodo-success-bg)',
    				'success-bd': 'var(--nodo-success-bd)',
    				'success-tx': 'var(--nodo-success-tx)',
    				'warn-bg':    'var(--nodo-warn-bg)',
    				'warn-bd':    'var(--nodo-warn-bd)',
    				'warn-tx':    'var(--nodo-warn-tx)',
    			},
    			background: 'hsl(var(--background))',
    			foreground: 'hsl(var(--foreground))',
    			card: {
    				DEFAULT: 'hsl(var(--card))',
    				foreground: 'hsl(var(--card-foreground))'
    			},
    			popover: {
    				DEFAULT: 'hsl(var(--popover))',
    				foreground: 'hsl(var(--popover-foreground))'
    			},
    			primary: {
    				DEFAULT: 'hsl(var(--primary))',
    				foreground: 'hsl(var(--primary-foreground))'
    			},
    			secondary: {
    				DEFAULT: 'hsl(var(--secondary))',
    				foreground: 'hsl(var(--secondary-foreground))'
    			},
    			muted: {
    				DEFAULT: 'hsl(var(--muted))',
    				foreground: 'hsl(var(--muted-foreground))'
    			},
    			accent: {
    				DEFAULT: 'hsl(var(--accent))',
    				foreground: 'hsl(var(--accent-foreground))'
    			},
    			destructive: {
    				DEFAULT: 'hsl(var(--destructive))',
    				foreground: 'hsl(var(--destructive-foreground))'
    			},
    			border: 'hsl(var(--border))',
    			input: 'hsl(var(--input))',
    			ring: 'hsl(var(--ring))',
    			chart: {
    				'1': 'hsl(var(--chart-1))',
    				'2': 'hsl(var(--chart-2))',
    				'3': 'hsl(var(--chart-3))',
    				'4': 'hsl(var(--chart-4))',
    				'5': 'hsl(var(--chart-5))'
    			}
    		}
    	}
    },
    plugins: [require("tailwindcss-animate")],
  }