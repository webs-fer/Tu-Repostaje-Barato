# SEO en GitHub Pages — pasos importantes

Este proyecto ya incluye SEO técnico básico:

- `title` y `meta description`
- etiquetas Open Graph y Twitter Card
- `robots.txt`
- `sitemap.xml`
- datos estructurados JSON-LD
- manifest PWA básico
- bloque de contenido visible para que Google entienda mejor la página

## 1. Cambiar TU_USUARIO por tu usuario real

Cuando GitHub Pages te dé la URL, cambia `TU_USUARIO` en estos archivos:

- `index.html`
- `robots.txt`
- `sitemap.xml`

Ejemplo, si tu URL es:

```text
https://fernando.github.io/tu-repostaje-barato/
```

Busca:

```text
https://TU_USUARIO.github.io/tu-repostaje-barato/
```

y cámbialo por:

```text
https://fernando.github.io/tu-repostaje-barato/
```

## 2. Publicar en GitHub Pages

1. Crea un repositorio público, por ejemplo `tu-repostaje-barato`.
2. Sube el contenido de esta carpeta.
3. Entra en `Settings > Pages`.
4. En `Build and deployment`, elige:
   - `Deploy from a branch`
   - rama `main`
   - carpeta `/root`
5. Guarda.

## 3. Enviar a Google Search Console

Cuando la web esté publicada:

1. Entra en Google Search Console.
2. Añade la propiedad de la URL de GitHub Pages.
3. Envía el sitemap:

```text
https://TU_USUARIO.github.io/tu-repostaje-barato/sitemap.xml
```

Cambiando `TU_USUARIO` por el usuario real.

## 4. Aviso realista

Tener SEO técnico no garantiza salir el primero en Google. Ayuda a que Google pueda rastrear e interpretar la web, pero para posicionar mejor harán falta visitas, enlaces externos, contenido útil y tiempo.
