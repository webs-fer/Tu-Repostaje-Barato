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
https://webs-fer.github.io/Tu-Repostaje-Barato/
```

## Paso SEO obligatorio cuando tengas la URL

Cuando GitHub Pages te dé la URL definitiva, cambia `TU_USUARIO` por tu usuario real en estos archivos:

- `index.html`
- `robots.txt`
- `sitemap.xml`
- `SEO-GITHUB-PAGES.md`

Ejemplo:

```text
https://webs-fer.github.io/Tu-Repostaje-Barato/
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
https://webs-fer.github.io/Tu-Repostaje-Barato/sitemap.xml
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


## Previsión orientativa de precios

Esta versión incluye una tarjeta de **Previsión orientativa** justo debajo del bloque **Top de gasolina/diésel más barato**.

La previsión no promete un precio exacto: calcula una tendencia aproximada a 3 días usando:

- el precio mínimo actual de los resultados encontrados;
- el histórico local que guarda el navegador con `localStorage`;
- el archivo `data/historico-precios.json`;
- una acción automática de GitHub Actions que puede actualizar el histórico cada día.

### Activar la actualización diaria en GitHub

Al subir el proyecto, GitHub detectará el workflow:

```text
.github/workflows/actualizar-historico-precios.yml
```

Puedes ejecutarlo manualmente desde:

```text
Actions > Actualizar histórico de precios > Run workflow
```

Y también queda programado diariamente. Si el workflow no puede escribir en el repositorio, revisa:

```text
Settings > Actions > General > Workflow permissions > Read and write permissions
```

### URL SEO actual

He dejado las URLs SEO preparadas para:

```text
https://webs-fer.github.io/Tu-Repostaje-Barato/
```

Si vuelves a cambiar usuario o nombre del repositorio, modifica esa URL en `index.html`, `robots.txt` y `sitemap.xml`.


## Variables de mercado gratuitas añadidas

La sección **Previsión orientativa** combina varias señales gratuitas:

- **Histórico de gasolineras**: precios mínimos/medios guardados desde la API oficial de carburantes.
- **Brent**: serie diaria DCOILBRENTEU de FRED en USD/barril, descargada como CSV sin clave.
- **EUR/USD**: Frankfurter API, sin API key, para estimar si el petróleo en dólares pesa más o menos en Europa.
- **Riesgo geopolítico**: GDELT DOC 2.0 API, sin API key, contando noticias sobre petróleo, conflictos, sanciones, OPEP, Rusia, Irán, Oriente Medio y suministro.

La fórmula visible en la web es:

```text
60% histórico de gasolineras + 25% Brent + 10% EUR/USD + 5% riesgo geopolítico
```

La previsión se muestra justo debajo del **Top de diésel/gasolina más barato** y es orientativa. No garantiza precios futuros.

### Importante para GitHub Actions

En tu repositorio, entra en:

```text
Settings > Actions > General > Workflow permissions
```

y marca:

```text
Read and write permissions
```

Después entra en **Actions**, ejecuta manualmente el workflow **Actualizar histórico y mercado** con `Run workflow`, o espera a la ejecución diaria.
