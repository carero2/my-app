# Gastos

Control de gastos personal. Web app que se instala en la pantalla de inicio del iPhone,
funciona sin conexión y guarda los datos solo en el móvil. Sin cuentas, sin servidor, sin coste.

## Publicar en GitHub Pages

1. Crea un repositorio en GitHub llamado `gastos` (puede ser privado; Pages funciona igual
   en cuentas gratuitas con repos públicos, así que ponlo público si te da problemas).
2. Sube estos archivos a la raíz del repo:
   ```
   index.html
   manifest.webmanifest
   sw.js
   icons/
   ```
3. Settings → Pages → Source: `Deploy from a branch` → rama `main`, carpeta `/ (root)` → Save.
4. En un minuto tendrás la URL: `https://TU-USUARIO.github.io/gastos/`

HTTPS es obligatorio para que funcione el modo offline. GitHub Pages ya lo da.

## Instalar en el iPhone

1. Abre la URL **en Safari** (Chrome no puede instalar en iOS).
2. Botón de compartir → **Añadir a pantalla de inicio**.
3. Ábrela siempre desde ese icono, no desde Safari.

## Automatización tras pagar

Atajos → Automatización → **+** → busca **Transacción** → elige tu tarjeta de Wallet.

Acción: **Abrir URLs** con
```
https://TU-USUARIO.github.io/gastos/?add=1
```

Desactiva "Ejecutar inmediatamente" para que te llegue una notificación en vez de abrirse sola.

Si el disparador *Transacción* no lista tu tarjeta, usa **App → Cartera → Se cierra**.

Otros accesos rápidos al mismo atajo:
- Ajustes → Accesibilidad → Tocar → **Tocar atrás** → Doble toque.
- **Botón Acción** (iPhone 15 Pro en adelante).

Se puede preseleccionar categoría: `?add=1&cat=comida`
(`comida`, `transporte`, `compras`, `ocio`, `hogar`, `salud`, `otros`).

## Copias de seguridad

Los datos viven en el `localStorage` de este dominio. Si borras el historial de Safari
marcando datos de sitios web, o desinstalas el icono, se pierden.
Usa **⋯ → Descargar copia** cada cierto tiempo y guarda el `.json` en iCloud Drive.
Se restaura desde el mismo menú.

## Cambiar categorías

En `index.html`, la constante `CATS` (id, nombre, emoji) y las variables de color `--comida`,
`--transporte`, etc. en el bloque `:root`. Si añades una categoría nueva, define su color con
el mismo nombre que el `id`.
