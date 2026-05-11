# Digital Twin

Complete React project for Dubai World Trade Centre digital twin visualization.

## Quick Start

### Prerequisites
- Node.js 18+ installed
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```
## Configuration

### Hall Layout
Edit `src/data/hallsLayout.js` to modify hall positions, sizes, or colors.

### Telemetry Mapping
The telemetry IDs map to halls:
- HZA01-06 → North Zone
- HZB01-08 → East Zone  
- HZC01-06 → South Zone
- HZD01-06 → Central

## Data Flow

1. Telemetry data loaded via `useTelemetry` hook
2. Data processed and mapped to halls
3. Hall colors update based on occupancy
4. Stats panel shows aggregated data

## Customization

### Colors
Edit `src/data/hallsLayout.js`:
```javascript
color: '#e09f3e' // Change hex color
```

### Hall Sizes
```javascript
width: 140,  // SVG units
height: 120  // SVG units
```

### Zone Names
Edit telemetry mapping in `hallsLayout.js`

## Development

### Add New Component
```bash
cd src/components
# Create new component file
```

### Modify 3D Scene
Edit `src/components/Scene3D.jsx`

### Change Data Source
Edit `src/hooks/useTelemetry.js` to connect real API

## Building for Production

```bash
npm run build
```

Output will be in `dist/` folder.

## 🚢 Deployment

### Static Hosting (Netlify, Vercel)
```bash
npm run build
# Deploy dist/ folder
```

### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
CMD ["npm", "run", "preview"]
```

## 👥 Team Collaboration

### Git Workflow
```bash
# Create feature branch
git checkout -b feature/your-feature

# Make changes
git add .
git commit -m "Description"

# Push and create PR
git push origin feature/your-feature
```

### Code Style
- Use ES6+ syntax
- Component names in PascalCase
- Props destructured in function params
- Comments for complex logic

## Troubleshooting

### Port Already in Use
```bash
# Change port in vite.config.js
server: { port: 3001 }
```

### Build Errors
```bash
# Clear cache
rm -rf node_modules
npm install
```

### 3D Not Rendering
- Check browser console for errors
- Verify WebGL support in browser
- Update graphics drivers

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review component documentation
3. Ask zaydan and masleen

---

**Built by SentinaAI Team**
