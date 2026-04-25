# Tu Repostaje Barato — versión estática con SEO para GitHub Pages

Aplicación web estática para encontrar **gasolina barata**, **diésel barato** y **puntos de recarga eléctrica** cerca de ti.

Esta versión está preparada para publicarse en **GitHub Pages**, sin PHP, sin XAMPP y sin base de datos.

## Qué incluye

- `index.html` como entrada principal.
- `assets/css/style.css` con diseño responsive.
- `assets/js/app.js` con toda la lógica en JavaScript.
- `data/estaciones.json` como respaldo local de precios de carburantes.
- `robots.txt` para permitir rastreo.
- `sitemap.xml` para ayudar a Google a descubrir la web.
- `site.webmanifest` para apariencia de app web.
- `assets/img/favicon.svg` e iconos.
- Open Graph y Twitter Card para compartir la web.
- JSON-LD con datos estructurados.
- Bloque visible de contenido SEO y preguntas frecuentes.

## Cómo subirlo a GitHub Pages

1. Crea un repositorio nuevo en GitHub, por ejemplo:

```text
tu-repostaje-barato
```

2. Sube **todo el contenido de esta carpeta** al repositorio.

3. En GitHub, entra en:

```text
Settings > Pages
```

4. En **Build and deployment**, selecciona:

```text
Source: Deploy from a branch
Branch: main
Folder: /root
```

5. Guarda.

La URL quedará parecida a:

```text
https://TU_USUARIO.github.io/tu-repostaje-barato/
```

## Paso SEO obligatorio cuando tengas la URL

Cuando GitHub Pages te dé la URL definitiva, cambia `TU_USUARIO` por tu usuario real en estos archivos:

- `index.html`
- `robots.txt`
- `sitemap.xml`
- `SEO-GITHUB-PAGES.md`

Ejemplo:

```text
https://TU_USUARIO.github.io/tu-repostaje-barato/
```

por:

```text
https://fernando.github.io/tu-repostaje-barato/
```

## Para aparecer en Google

Después de publicarla:

1. Entra en Google Search Console.
2. Añade tu URL de GitHub Pages.
3. Envía el sitemap:

```text
https://TU_USUARIO.github.io/tu-repostaje-barato/sitemap.xml
```

4. Espera a que Google rastree e indexe la web.

## Notas importantes

- GitHub Pages no ejecuta PHP. Por eso esta versión no contiene carpeta `api/` ni archivos `.php`.
- La app intenta consultar datos públicos desde JavaScript. Si una API externa falla, usa `data/estaciones.json` como respaldo.
- La geolocalización funciona mejor publicada en GitHub Pages con HTTPS.
- SEO no significa aparecer automáticamente el primero. El proyecto queda preparado para indexación, pero Google decide cuándo y cómo posicionarlo.

## Probar en local

Mejor usar un servidor local:

```bash
python -m http.server 8000
```

Y abrir:

```text
http://localhost:8000/
```
