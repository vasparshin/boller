# Vector Logo Viewer

This project displays uploaded vector graphics in the browser. Users can select an SVG, DXF, or DWG file and it will be converted to SVG and shown on the page.

DXF and DWG files are parsed in the browser and transformed into SVG markup so the viewer only renders vector data.

## Development

Run a static file server and open `index.html` in the browser to use the viewer.

## Testing

The project uses no build step. To check the syntax of the JavaScript file:

```bash
node --check main.js
```

There is no automated test suite.
