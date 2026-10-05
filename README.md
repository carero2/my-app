# My-app

App personal de seguimiento diario: **finanzas**, **hábitos** e **inversiones**.

Es una aplicación web progresiva (PWA) que se instala en la pantalla de inicio del iPhone,
funciona sin conexión y sincroniza los datos entre dispositivos a través de un Cloudflare
Worker propio. No hay App Store, no hay cuenta de desarrollador, no hay servicio de terceros
con tus datos y no hay coste: tanto GitHub Pages como el plan gratuito de Cloudflare cubren
de sobra este uso.

---

## Índice

- [Características](#características)
- [Cómo funciona](#cómo-funciona)
- [Reglas de diseño](#reglas-de-diseño)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Requisitos](#requisitos)
- [Instalación](#instalación)
  - [1. Publicar la app en GitHub Pages](#1-publicar-la-app-en-github-pages)
  - [2. Instalarla en el iPhone](#2-instalarla-en-el-iphone)
  - [3. Desplegar el Worker (opcional)](#3-desplegar-el-worker-opcional)
  - [4. Conectar la app con el Worker](#4-conectar-la-app-con-el-worker)
- [Uso](#uso)
  - [Inversión](#inversión)
  - [Qué pasa al guardar un movimiento](#qué-pasa-al-guardar-un-movimiento)
  - [El mes contable](#el-mes-contable)
  - [El calendario](#el-calendario)
  - [Apariencia](#apariencia)
- [Integración con Atajos de iOS](#integración-con-atajos-de-ios)
- [Importar movimientos desde CSV](#importar-movimientos-desde-csv)
- [Modelo de datos](#modelo-de-datos)
- [API del Worker](#api-del-worker)
- [Sincronización y modo sin conexión](#sincronización-y-modo-sin-conexión)
- [Copias de seguridad](#copias-de-seguridad)
- [Desarrollo](#desarrollo)
- [Resolución de problemas](#resolución-de-problemas)
- [Limitaciones conocidas](#limitaciones-conocidas)
- [Ideas pendientes](#ideas-pendientes)

---

## Características

**Finanzas**
- Teclado numérico propio para registrar un gasto en dos segundos
- Categorías editables desde la app: nombre, emoji, color y orden
- Ingresos además de gastos, con balance y tasa de ahorro
- Presupuesto del mes y límites por categoría, combinables y ambos opcionales
- Fecha y hora manuales, para efectivo o recibos atrasados
- Listado por meses con filtro por categoría y edición al tocar
- Métricas del mes: variación frente al mes anterior y frente a tu media trimestral, media
  diaria, días sin gastar, día más caro, proporción de gasto fijo, tasa de ahorro y de
  esfuerzo, proyección a fin de mes, desglose por categoría y evolución de seis meses
- Métricas del año: media mensual, mes más caro y más contenido, balance y tasa de ahorro,
  meses cerrados en positivo, meses dentro del presupuesto, reparto fijo frente a variable,
  gasto mes a mes y desglose por categoría con su media mensual
- Importación desde CSV con detección de duplicados y autocategorización
- Exportación a CSV
- Mes contable propio: el mes puede empezar el día que tú cobras, no el 1
- Gastos fijos que se registran solos cada mes
- Búsqueda por concepto, categoría o importe, con filtro por rango de importe
- Notas sugeridas a partir de las que ya has usado
- Repetir un movimiento con una pulsación larga

**Hábitos**
- Grupos definidos por el usuario que funcionan como submódulos (trabajo, sueño…),
  cada uno con su propio color
- Tres tipos: sí/no, cantidad con objetivo, y cronómetro tipo pomodoro
- Tres periodicidades: cada día, cada semana o cada mes
- Días activos: un hábito diario puede contar solo de lunes a viernes, por ejemplo
- Hábitos de solo seguimiento, que se registran pero no cuentan en el progreso del día
- Registro retroactivo: tocar cualquier celda de la tira corrige ese periodo
- Rachas, tira de progreso y resumen calculados sobre la periodicidad de cada hábito
- Resumen por semana, mes o año, cada uno con sus propias métricas, gráfico de
  subperiodos y comparación con el periodo anterior
- **Calendario del mes** con tres ámbitos: todos los hábitos diarios, una sección
  concreta o un hábito suelto (incluidos los semanales y mensuales)
- Archivar en vez de borrar, conservando el historial

**Generales**
- Funciona sin conexión, incluida la escritura
- Sincronización entre dispositivos con cola de pendientes
- Modo oscuro automático según el sistema
- Deshacer al borrar cualquier cosa
- Copia de seguridad y restauración en JSON

---

**Inversiones**
- Carteras con sus aportaciones y reembolsos en una sola línea de tiempo
- Tres formas de saber lo que vale, según lo que puedas conseguir: precios automáticos por
  ISIN, valor anotado a mano, o estimación a un interés anual
- Valor liquidativo de fondos europeos por ISIN, servido por tu Worker y cacheado
- Rentabilidad anualizada por TIR, no por regla de tres
- Gráfica de lo aportado frente a lo que vale, y reparto por fondo

## Cómo funciona

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│  GitHub Pages   │         │     iPhone       │         │   Cloudflare    │
│                 │  HTML   │                  │  HTTPS  │                 │
│  código de la   ├────────►│  My-app          │◄───────►│  Worker + KV    │
│  app (público)  │  CSS/JS │  localStorage    │  JSON   │  tus datos      │
│                 │         │  service worker  │         │  (privado)      │
└─────────────────┘         └──────────────────┘         └─────────────────┘
                                     ▲
                                     │  POST directo
                              ┌──────┴───────┐
                              │  Atajos iOS  │
                              └──────────────┘
```

El **código** vive en GitHub Pages y es público. Los **datos** nunca pasan por ahí: viven en
el KV de tu Worker y en el `localStorage` del dispositivo, que actúa como caché para poder
trabajar sin cobertura.

La app es **local primero**: cualquier cosa que escribas se guarda al instante en el
dispositivo y se marca como pendiente. La subida ocurre después, cuando haya red. Nunca
esperas a que responda el servidor.

Sin Worker configurado, la app funciona igual pero los datos existen solo en ese dispositivo.

---

## Reglas de diseño

`css/estilo.css` empieza con un bloque de tokens y todo lo demás los usa. Si algo hay que
cambiar, se cambia ahí y no en la regla concreta.

| Grupo | Tokens |
|---|---|
| Superficies | `--paper` fondo · `--card` elevado · `--hueco` hundido |
| Texto | `--ink` · `--muted` · `--line` para el borde de 1px |
| Acento | `--acento` único, para acciones, enlaces y foco |
| Espaciado | `--e1` 4px … `--e7` 32px, siempre múltiplos de 4 |
| Tipografía | `--t-meta` 12 · `--t-aux` 14 · `--t-base` 16 · `--t-med` 20 · `--t-tit` 26 · `--t-cifra` 34 |
| Radios | `--r1` 8 · `--r2` 12 · `--r3` 16 · `--r4` 22 · `--rp` píldora |
| Movimiento | `--m1` 100ms · `--m2` 150 · `--m3` 200 · `--m4` 300 |

Cinco reglas que no se rompen:

1. **Nada por debajo de 12px**, ni siquiera en las etiquetas de los gráficos, y solo tres
   pesos: 400, 500 y 600.
2. **Toda superficie elevada lleva borde de 1px** además de fondo. La sombra es casi
   inexistente; el borde es lo que separa. En modo oscuro se le suma un filo claro arriba
   (`--brillo`), porque ahí un borde solo no se ve.
3. **Un único color de acento.** Los colores de categoría y de grupo identifican datos,
   nunca acciones.
4. **44×44 como mínimo** en todo lo que se pulsa. Por eso la tira de la semana se desborda
   12px de su tarjeta: es la única forma de que siete celdas lleguen a 44px en 375px.
5. **Solo se animan `transform` y `opacity`**, con las duraciones de la tabla, y
   `prefers-reduced-motion` lo apaga todo.

Además: cada estado vacío dice qué falta, por qué está vacío y trae el botón que lo llena;
los botones de icono llevan `aria-label` descriptivo y `data-tip` (la pista visible), nunca
`title`; y no se usa `confirm()` del navegador, sino `confirmar()` de `nucleo.js`, que nombra
lo que se va a borrar, arranca con el foco en Cancelar y se cierra con Escape.

`abrirHoja()` encierra el foco dentro de la hoja mientras está abierta y lo devuelve al botón
que la abrió al cerrarla.

## Estructura del proyecto

```
my-app/
├── index.html                armazón: contenedores de vistas y barra de pestañas
├── manifest.webmanifest      nombre, iconos y modo standalone
├── sw.js                     service worker: caché para funcionar sin conexión
├── css/
│   └── estilo.css            todos los estilos, con variables de tema
├── js/
│   ├── app.js                arranque, navegación entre módulos, parámetros de URL
│   ├── nucleo.js             datos, persistencia, sincronización, avisos y hojas modales
│   ├── hoy.js                pestaña Hoy
│   ├── finanzas.js           añadir, movimientos, métricas e importador CSV
│   ├── habitos.js            hábitos, periodos, rachas y resumen
│   ├── habitos-ui.js         interfaz de hábitos: tarjetas, resumen y calendario
│   ├── inversiones.js        carteras, TIR y proyección
│   ├── inversiones-ui.js     interfaz de inversiones
│   └── ajustes.js            nube, presupuesto, mes contable, apariencia y copias
└── icons/
    ├── apple-touch-icon.png  180×180, el que usa iOS
    ├── icon-192.png
    └── icon-512.png
```

El Worker vive en un repositorio aparte:

```
gastos-api/
├── wrangler.toml
└── src/worker.js
```

**Ningún módulo habla con `localStorage` directamente.** Todo pasa por `nucleo.js`, que se
encarga de persistir, marcar pendientes y avisar a la interfaz de que hay que repintar.
Añadir un módulo nuevo consiste en crear un archivo con una función `pintar(vista)`,
registrarlo en `MODULOS` dentro de `app.js` y añadir su sección y su botón en `index.html`.

---

## Requisitos

**Para usar la app:** un iPhone con iOS 16.4 o superior y Safari. Funciona igual en Android
y en escritorio, pero la instalación en pantalla de inicio está pensada para iOS.

**Para publicarla:** una cuenta de GitHub. El repositorio debe ser público, porque GitHub
Pages no funciona con repositorios privados en el plan gratuito.

**Para la sincronización:** una cuenta de Cloudflare (gratuita, sin tarjeta) y Node.js 18 o
superior para ejecutar Wrangler.

---

## Instalación

### 1. Publicar la app en GitHub Pages

Sube el contenido de esta carpeta a la raíz del repositorio, **respetando las carpetas
`js/`, `css/` e `icons/`**. Si los archivos JavaScript no quedan dentro de `js/`, los
módulos no se cargan y verás una pantalla en blanco.

```bash
git init
git add .
git commit -m "primera versión"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/my-app.git
git push -u origin main
```

En GitHub: **Settings → Pages → Source: Deploy from a branch**, rama `main`, carpeta
`/ (root)`, y **Save**. En uno o dos minutos tendrás la URL:

```
https://TU-USUARIO.github.io/my-app/
```

HTTPS es obligatorio para que funcionen los módulos de JavaScript y el service worker.
GitHub Pages ya lo proporciona.

### 2. Instalarla en el iPhone

1. Abre la URL **en Safari** (Chrome en iOS no puede instalar aplicaciones web).
2. Botón de compartir → **Añadir a pantalla de inicio**.
3. Ábrela siempre desde ese icono.

> **Importante:** Safari y el icono de la pantalla de inicio tienen almacenamientos
> separados. Los datos que escribas en uno no aparecen en el otro. Con el Worker
> configurado en ambos deja de importar, porque los dos leen de la misma fuente.

### 3. Desplegar el Worker (opcional)

Sin este paso la app funciona, pero los datos existen solo en ese dispositivo.

```bash
mkdir -p gastos-api/src && cd gastos-api
# copia aquí wrangler.toml y src/worker.js
npm install --save-dev wrangler
npx wrangler login
npx wrangler kv namespace create GASTOS
```

Pega el `id` que devuelve el último comando en `wrangler.toml`, sustituyendo
`PEGA_AQUI_EL_ID`. Después genera una clave larga y aleatoria:

```bash
# macOS o Linux
openssl rand -base64 32

# Windows PowerShell
$b = New-Object byte[] 32
(New-Object System.Security.Cryptography.RNGCryptoServiceProvider).GetBytes($b)
$k = [Convert]::ToBase64String($b); $k | Set-Clipboard; "Copiada"
```

Guárdala en un gestor de contraseñas o en una nota bloqueada, y regístrala como secreto:

```bash
npx wrangler secret put CLAVE     # pega el valor cuando lo pida
npx wrangler deploy
```

El despliegue imprime la URL del Worker. Compruébalo:

```bash
curl https://TU-WORKER.workers.dev/salud
# {"ok":true}
```

`/salud` es la única ruta que no pide clave, precisamente para poder distinguir
"el Worker no responde" de "la clave es incorrecta".

### 4. Conectar la app con el Worker

En la app, pestaña **Ajustes → Sincronización**: pega la dirección del Worker y la clave, y
pulsa *Guardar y comprobar*. Si conecta, sube todo lo que ya tuvieras en ese dispositivo.

Repite lo mismo en cada sitio desde el que uses la app (Safari, el icono de la pantalla de
inicio, el ordenador). Cada uno guarda la configuración por separado.

---

## Uso

| Pestaña | Para qué sirve |
|---|---|
| **Hoy** | Pantalla de inicio: gasto del día y del mes, y los hábitos listos para marcar |
| **Finanzas** | Añadir movimiento, listado por meses y métricas |
| **Hábitos** | Los grupos que definas, más un resumen con métricas y un calendario del mes |
| **Ajustes** | Nube, presupuesto, importación, copias y borrado |

**Añadir un gasto:** teclado numérico, categoría y guardar. El botón `↓ Gasto` lo cambia a
`↑ Ingreso`. El botón de fecha permite registrar algo de otro día.

**Categorías.** En Ajustes → *Gestionar categorías* puedes crear, renombrar, recolorear y
reordenar. Las ocho iniciales se crean solas la primera vez.

Al crear una, su **identificador** se genera a partir del nombre sin acentos ni espacios
(«Educación y cursos» → `educacion-y-cursos`). Ese identificador **no cambia al renombrar**,
para que el histórico no se rompa; por eso Gimnasio sigue siendo `salud` por dentro. La hoja
de edición te lo muestra, porque es lo que debe enviar el atajo de iOS.

Una categoría con movimientos no se puede borrar, solo **archivar**: desaparece del teclado
pero sus movimientos la conservan. Sin movimientos, se borra con opción de deshacer. Y si un
movimiento apunta a una categoría que ya no existe, se sigue mostrando con su nombre en vez
de convertirse en «Otros».

**Gastos fijos.** En Ajustes → *Gastos fijos* defines concepto, importe, categoría y día del
mes. Cada vez que abres la app se registran los que ya tocaban y no se habían creado todavía,
como un movimiento normal marcado con la etiqueta «fijo». Puedes editarlos o borrarlos
después uno a uno, y pausar la plantilla sin perder el histórico. El día máximo es 28 para
que exista en todos los meses.

Separarlos mejora la proyección a fin de mes: los fijos no se promedian por día, se suman
enteros una sola vez. Con 750 € de alquiler el día 1 y 10 € diarios, a mitad de mes la
proyección ingenua decía 1.800 € y la real son 1.050 €.

**Buscar.** En Movimientos, el buscador filtra por concepto, categoría o importe, y debajo hay
un filtro **desde / hasta** para acotar por importe. Los dos se combinan, y con cualquiera
activo se ignora el mes seleccionado: se busca en todo el histórico. Arriba de los resultados
aparece el recuento, el total y la media de lo encontrado, que es lo que suele interesar
(«¿cuánto llevo gastado en cafés este año?»). La ✕ quita todos los filtros de golpe.

**Repetir un movimiento.** Una pulsación larga sobre cualquier fila de Movimientos crea una
copia con la fecha de ahora, con opción de deshacer. Para el café de todos los días.

**Notas sugeridas.** Al escribir una nota aparecen debajo las que ya has usado, ordenadas por
frecuencia y filtradas por lo que llevas escrito.

**Presupuesto.** Hay dos niveles independientes y compatibles, los dos opcionales:

- **Presupuesto del mes**: un tope para todo el gasto mensual. Alimenta la barra de la cinta
  de Finanzas y el panel de la pestaña Hoy.
- **Límite por categoría**: un tope propio para las categorías que quieras.

En Métricas, cada categoría se mide contra la referencia que le corresponde. Si tiene límite
propio, el porcentaje es sobre ese límite y verás «quedan 120 €» o «40 € de más» en rojo. Si
no lo tiene, el porcentaje es sobre el presupuesto del mes, y si tampoco hay presupuesto,
sobre el gasto total del mes.

Las categorías que superan su límite salen en rojo también en la cinta de Finanzas y en Hoy.
Ajustes avisa si la suma de los límites por categoría se pasa del presupuesto del mes.

**Editar o borrar un movimiento:** en *Movimientos*, tócalo para editarlo o pulsa la ✕ para
borrarlo. Sale un aviso con **Deshacer** durante seis segundos.

**Crear un hábito:** en *Hábitos*, botón `+ Hábito`. El campo **Grupo** se convierte en una
pestaña dentro del módulo. Elige periodicidad y tipo:

| Tipo | Cómo se registra | Ejemplo |
|---|---|---|
| Sí o no | Una casilla que marcas | Meditar, no fumar |
| Cantidad | Botones − y + hacia un objetivo | 20 páginas al día, 2 libros al mes |
| Cronómetro | Play y stop, acumula minutos | 25 min de trabajo concentrado |

En los de cantidad, tocar el número abre un campo para escribir el valor exacto. En los de
cronómetro, el objetivo en minutos actúa como pomodoro: al llegar, vibra y avisa.

**Días activos.** Un hábito diario puede limitarse a ciertos días de la semana. Los días que
no marques se saltan: no rompen la racha, no cuentan en el progreso y aparecen apagados en
la tira. Un hábito de trabajo de lunes a viernes no se penaliza los sábados.

**Objetivo o solo seguimiento.** Un hábito puede no ser un objetivo. Marcado como *solo
llevar la cuenta*, se registra y se acumula con normalidad, pero **nunca aparece como
cumplido**, no genera racha y no entra en ningún porcentaje ni en el círculo del día. Es lo
que quieres para medir sin premiar: comidas poco sanas, cigarros, gasto en caprichos. En el
resumen tienen su propia sección, con el total del periodo en vez de un porcentaje.

**Registro retroactivo.** Si se te olvidó anotar algo, toca cualquier celda de la tira de
progreso de ese hábito y se abre el registro de ese periodo. Dentro puedes además cambiar la
fecha con el selector, así que llegas a cualquier día pasado, no solo a los siete visibles.

**El círculo de progreso** solo cuenta los hábitos diarios que tocan hoy y que no estén
marcados como solo seguimiento. Los semanales y mensuales quedan fuera: si contaran, el
círculo diría que vas al 50% un día 3 del mes por un objetivo que tienes hasta el día 30.
La pestaña Hoy, por el mismo motivo, muestra solo los hábitos del día.

**El resumen** tiene tres ventanas, y cada una destaca lo que en ella tiene sentido:

| Ventana | Gráfico | Métricas propias |
|---|---|---|
| Semana | día a día, L–D | días redondos, cumplidos, lo que queda, sesiones extra |
| Mes | semana a semana | días redondos, hábitos al 100%, fallos dobles, recuperación |
| Año | mes a mes | cumplidos del año, días redondos, mejor mes, recuperación |

Además, en las ventanas de mes y año hay un desglose **por día de la semana**, que señala tu
día flojo. Cada hábito muestra su racha actual y su mejor racha histórica.

Un **día redondo** es un día ya transcurrido en el que se cumplió todo lo que tocaba ese día.

Dos métricas menos obvias, tomadas de lo que funciona en las apps de hábitos: los **fallos
dobles** (dos periodos seguidos sin cumplir) y la **tasa de recuperación** (de las veces que
fallaste, cuántas volviste al periodo siguiente). La racha premia la perfección y se rompe con
un despiste; lo que de verdad predice que un hábito se consolide es no fallar dos veces
seguidas. Por eso conviven con la racha en vez de sustituirla.
Las tres ventanas comparan además con el periodo anterior en puntos porcentuales, y señalan
el hábito que mejor llevas y el que más se te resiste.

Las ventanas se calculan sobre tres periodos naturales: la semana en curso de lunes a
domingo, el mes del día 1 al último, y el año completo. El porcentaje es cumplidos entre
*lo que tocaba hasta hoy*, no entre el rango entero: un miércoles con dos entrenamientos
de tres días transcurridos marca 67%, no 29%. Los periodos aún no transcurridos no
penalizan, y tampoco los anteriores a la creación del hábito.

Cada ventana solo incluye los hábitos cuyo periodo cabe dentro: los mensuales no aparecen
en el resumen semanal, porque su periodo es más largo que la ventana. Un aviso al pie indica
cuántos quedan fuera y dónde verlos.

### Qué pasa al guardar un movimiento

Guardar es el final de una tarea, no un paso intermedio, así que la app te devuelve de donde
viniste en vez de dejarte en el teclado mirando una pantalla en blanco:

| Entraste desde | Al guardar vuelves a |
|---|---|
| Hoy, con «Añadir gasto» | Hoy, con el total del día ya actualizado |
| Movimientos, tocando una fila para editarla | Movimientos |
| La pestaña Añadir | Movimientos, donde ves el apunte recién hecho |
| El atajo de iOS (`?add=1`) | Hoy |

Como el movimiento desaparece de la vista al cambiar de pantalla, el aviso de confirmación
lleva **Deshacer**: es la única forma de corregir un dedazo sin tener que ir a buscarlo.

### Inversión

Un **producto** es cualquier cosa en la que tengas dinero metido: una cartera gestionada, un
plan de pensiones, unas acciones, un piso. Por dentro todos son lo mismo —una lista de
movimientos— y el tipo solo decide dos cosas: cómo se actualiza su valor y si el dinero es
disponible o no. No hay lógica distinta por tipo, que es lo que mantiene el módulo pequeño.

La pestaña tiene dos pantallas: **Mis productos** y **Simulador**.

#### Mis productos

El agregado va en este orden, y el orden importa:

1. **Valor total**, y debajo la **plusvalía en euros** y la **TIR anual**. Nada más arriba. La
   pregunta que uno se hace al abrir esto es «cuánto tengo y he ganado dinero», y el euro
   absoluto la responde mejor que ningún porcentaje.
2. **Aportado contra valor**, en una sola gráfica. La distancia entre las dos líneas *es* la
   plusvalía: hace visible el interés compuesto y hace llevaderas las caídas.
3. **La lista de productos**, cada uno con su valor y su plusvalía.

#### El periodo de la gráfica

La gráfica enseña por defecto **toda la historia**, y encima lleva `1M · 3M · 6M · 1A · Todo`.
Cambiar de periodo vuelve a pintar solo el panel, así que la página no se mueve bajo el dedo.

Lo que no se ve pero sostiene todo lo demás es que **el paso del eje cambia con el periodo**. Un
mes medido mes a mes da un punto, y diez años dan ciento veinte: ni una cosa ni la otra es una
línea. Así que el corte se elige por lo que dura el periodo, buscando que siempre haya entre una
docena y unas cuarenta marcas, que es la densidad en la que una línea se lee:

| Duración | Paso | Marcas |
| --- | --- | --- |
| hasta mes y medio | diario | hasta 46 |
| hasta ~11 meses | semanal | 7 – 45 |
| hasta 3 años | fin de mes | 11 – 37 |
| más de 3 años | fin de trimestre | 13 en adelante |

Dos detalles que solo se notan cuando faltan. **El último punto es siempre ahora**, no el último
día cerrado, porque el borde derecho tiene que ser el valor de hoy. Y **la etiqueta lleva el año
en cuanto el periodo pasa de once meses**: sin eso, en una gráfica de dos años hay dos «oct» y no
hay forma de saber cuál es cuál.

**La escala no empieza en cero.** Forzar el cero es lo correcto en un gráfico de barras, pero aquí
machaca justo el dato: en un periodo corto las dos líneas valen casi lo mismo y, medidas desde
cero, quedan pegadas arriba sin que se vea ni el movimiento ni el hueco entre ellas. Como no
empezar en cero exagera las subidas, cuando ocurre se dice debajo de la gráfica en vez de
esconderlo.

El detalle de un producto repite el mismo esqueleto una capa más abajo, más sus movimientos y
su ficha. Repetir el patrón es lo que hace que una app con cuentas se sienta sencilla.

Los productos de los que no se puede disponer cuando uno quiere —un plan de pensiones, un
inmueble— se marcan y se descuentan del total disponible, que se enseña aparte.

#### Una sola rentabilidad

Se enseña la **TIR** y nada más, con una línea debajo que dice lo que es: «rentabilidad anual
de tu dinero, contando cuándo metiste cada euro; no es la rentabilidad del producto».

La alternativa, la rentabilidad ponderada por tiempo, mide al gestor y no a ti, y enseñar las
dos a la vez es la forma más rápida de que alguien deje de fiarse de sus propios números: con
aportaciones periódicas las dos se separan mucho y la gente acaba preguntando cómo puede estar
ganando y perdiendo a la vez. Tampoco se enseña el porcentaje simple sobre lo aportado, que con
aportaciones repartidas en el tiempo directamente miente.

#### Dos niveles de entrada

No hace falta el histórico completo para ver un número. **Nivel 1**: creas el producto y anotas
lo que vale; eso ya da valor y plusvalía desde el primer día. **Nivel 2**: añades las
aportaciones con sus fechas, y eso desbloquea la TIR y la gráfica. Nunca se bloquea el nivel 1,
que es justo lo que hace que la gente abandone estas apps y vuelva a su hoja de cálculo.

#### Cómo se sabe lo que vale

| Modo | Qué hace | Para qué sirve |
|---|---|---|
| **Valor a mano** | Apuntas tú el total cuando lo consultes | Lo único posible para una cartera gestionada, un plan de pensiones o un piso |
| **Precios automáticos** | Apuntas las posiciones y se busca su precio | Cuando controlas las posiciones; se mantiene solo entre movimientos |

**Cuándo hay que volver a pegar el extracto:** cuando aportes, vendas, o sepas que han
rebalanceado. Entre medias no hace falta tocar nada, porque los títulos no se mueven solos y lo
único que cambia es el precio. Si se queda viejo, la app lo detecta —sabe qué aportaciones has
registrado después— y avisa de cuánto se está quedando corto el valor.

#### Pegar el extracto

El botón **Pegar tabla** acepta la tabla de posiciones tal cual la copias del banco, con
cabeceras y columnas de sobra. De cada fila saca el identificador, la cantidad y, si viene, el
valor de mercado en euros, que se anota como valoración del día.

No se asume ningún formato concreto, solo que cada fila lleve un identificador y una cantidad.
Los ISIN se reconocen en cualquier parte de la línea porque su formato es inconfundible. Los
**tickers** solo se aceptan cuando abren la línea y les sigue una cantidad: un ticker suelto es
indistinguible de una palabra cualquiera, y sin esa cautela un texto corriente generaría
posiciones inventadas llamadas «EUR» o «TOTAL».

Dos detalles que hacen falta para que funcione con extractos reales:

- Hay tablas donde **los títulos llevan el punto como separador decimal** (`3.52`
  participaciones) mientras que **los importes de la misma tabla llevan la coma**
  (`1.234,5600 €`). El lector mira cuál es el último separador de cada número en vez de asumir
  una convención.
- Muchos nombres de producto llevan cifras dentro, así que los títulos se buscan como el último
  número antes del primer importe con divisa, no como el primer número de la fila.

Lo que esté en la app y no aparezca en el extracto se entiende vendido y se quita.

#### De dónde salen los precios

Para acciones y ETFs hay ticker y Yahoo Finance los sirve. Los fondos de inversión son el caso
difícil: no cotizan en bolsa, así que no hay ticker ni precio intradía, solo un valor
liquidativo que la gestora publica una vez al día y con un día de retraso. Las APIs financieras
con plan gratuito (Twelve Data, Financial Modeling Prep, Alpha Vantage) excluyen los fondos
europeos, así que la fuente es la ficha pública de **quefondos.com**, que cubre todo lo
registrado en España y no pide clave; Yahoo queda de respaldo también para ellos.

El identificador decide la ruta: un ISIN va primero a quefondos y luego a Yahoo; un ticker va
directo a Yahoo. Las llamadas las hace tu Worker, no el navegador, y el resultado se cachea doce
horas en KV.

**Divisas.** Un producto en dólares no se puede sumar a uno en euros: tratar 192,86 $ como
192,86 € infla esa posición un 12%. El Worker convierte con el tipo del Banco Central Europeo,
servido por frankfurter.dev. Si un día no hay tipo de cambio, la posición se queda sin valorar
antes que valorarse mal.

Si algo no se puede valorar, la app lo dice y **no** inventa el total: una cartera a medio
valorar daría un número falso.

#### Aportaciones periódicas

Quien aporta todos los meses acumula decenas de apuntes iguales, y teclearlos uno a uno es justo
la razón por la que luego no hay historial con el que calcular nada. Al añadir una aportación se
puede elegir **Periódica**: importe, cada cuánto, desde cuándo y hasta cuándo. La
previsualización dice cuántas salen y cuánto suman, para poder cuadrarlo con lo que el banco
llame «invertido» antes de guardar.

El día del mes se conserva: quien aporta el 31 sigue aportando el 31, y en los meses que no lo
tienen cae en el último día sin arrastrar el desfase a los siguientes.

**Dos formas de decir lo mismo.** Dentro de «Periódica» hay un interruptor: *sé cuánto puse cada
vez* o *sé el total*. El importe de cada aportación es un dato que casi nadie recuerda y que
además cambió por el camino; el total acumulado, en cambio, está escrito en la pantalla del banco
como «invertido» o «aportado». Con la segunda opción se teclea ese total y la app lo reparte por
igual entre los periodos, dándole los céntimos del redondeo a la última aportación para que la
suma cuadre al céntimo con lo que se ha escrito.

El reparto por igual es una aproximación, y conviene saber cuánto cuesta. Sobre un caso de dos
años, el error en la rentabilidad anual (TIR) frente a lo que habría salido con los importes
reales:

| Cómo entró el dinero de verdad | Error de la aproximación |
| --- | --- |
| Importes irregulares mes a mes | 0,7 puntos |
| El doble los primeros 12 meses | 3,0 puntos |
| El doble los últimos 12 meses | 4,3 puntos |
| Todo de golpe al principio | 10,0 puntos |

La lectura es que el reparto por igual aguanta bien lo que hace la mayoría —aportar más o menos lo
mismo cada mes— y que el error grande no viene de repartir, sino de meter el total como **una sola
aportación**. Eso le dice a la app que el dinero llevaba dos años trabajando cuando la mitad llevaba
uno, y hunde la rentabilidad diez puntos. Si hubo un cambio de importe claro a mitad de camino, lo
exacto es hacer dos series periódicas, una por tramo.

#### El simulador

No mira tus datos: proyecta una regla de ahorro. Pide cuatro cosas —aportación mensual, capital
inicial, años y nada más— y detrás de «Más supuestos» esconde la inflación y la subida anual de
la aportación.

Tres decisiones deliberadas, todas en la misma dirección:

- **Tres escenarios etiquetados por su supuesto**, no una banda de confianza. La gente lee los
  extremos de una barra de error como el mínimo y el máximo reales, y no lo son. «Si rindiera un
  6% al año» no se puede malinterpretar así, porque el supuesto está escrito en la propia fila.
- **Redondeado a miles.** «91.000 €», nunca «90.947,31 €». La falsa precisión es lo que crea la
  falsa certeza.
- **El desglose de dónde sale el dinero**: cuánto pones tú y cuánto pone el interés compuesto.
  Es el número que convence, y además es cierto por construcción.

Los porcentajes son fijos y declarados, no derivados del histórico reciente. Derivarlos de datos
recientes es lo que hace que los escenarios regulatorios den absurdos en ambos sentidos.

Y la pestaña vacía abre el simulador, no un formulario de alta: para quien todavía no invierte,
el simulador *es* la puerta de entrada.

#### Qué dicen tus números

Un bloque en la pantalla principal con lo que se puede afirmar con certeza mirando los datos
propios. No recomienda productos ni opina sobre el mercado. Cuando compara con una regla
conocida, cita la regla, para que quede claro que es una referencia ajena y no un juicio de la
app. Cada hallazgo aparece solo si hay datos suficientes para que sea cierto: es preferible una
pantalla con dos cosas verdaderas que con seis de relleno.

| Hallazgo | Qué dice |
|---|---|
| **Coste** | Lo que pagas al año en comisiones, y lo que esas comisiones se llevarían en veinte años |
| **Concentración** | Si más del 60% está en un solo producto |
| **Tasa de inversión** | Qué parte de lo que ingresas acaba invertida, con la regla del 50/30/20 como referencia |
| **Constancia** | Meses sin aportar en el último año |
| **Coste de retirar** | Lo que pagarías de IRPF si lo vendieras todo hoy |
| **Datos viejos** | Productos que llevan más de mes y medio sin actualizar |

La tasa de inversión es la que esta app puede calcular y una app de cartera no: aquí están las
dos mitades, lo que entra y lo que se invierte. El ingreso sale de la media de los últimos seis
meses de Finanzas, y solo aparece si hay al menos tres meses con ingresos registrados.

**Sobre el coste.** quefondos publica la comisión de gestión y la de depósito, pero no los
gastos corrientes. Lo que sale es por tanto un **suelo**, no el total, y así se dice. La comisión
de quien gestiona la cartera no está en la ficha de ningún fondo, así que se pone a mano en los
ajustes del producto. La media es ponderada por valor y solo sobre la parte cuya comisión se
conoce: extrapolarla al resto sería inventarse el dato.

#### El coste fiscal de retirar

Estima lo que pagarías de IRPF si vendieras todo hoy, con la **escala del ahorro** vigente desde
el ejercicio 2025 (el tipo máximo subió del 28% al 30%):

| Ganancia | Tipo |
|---|---|
| hasta 6.000 | 19% |
| 6.000 – 50.000 | 21% |
| 50.000 – 200.000 | 23% |
| 200.000 – 300.000 | 27% |
| más de 300.000 | 30% |

Los tramos son **marginales**: cada uno se aplica solo a su parte, no al total. Es estatal y no
varía por comunidad, salvo Navarra y País Vasco, que tienen la suya.

**Lo que se excluye y por qué.** Cada tipo de producto lleva en qué base tributa:

- **Base del ahorro, sobre la ganancia**: carteras, fondos, ETFs, acciones, cripto. Son los que
  entran en el cálculo.
- **Base general, sobre el total rescatado**: planes de pensiones. No es que paguen sobre la
  ganancia a otro tipo, es que pagan sobre **todo** lo que saques, como rendimiento del trabajo,
  a tu tipo marginal. Mezclarlos daría un número muy equivocado, así que quedan fuera y se dice
  cuáles son.
- **Reglas que no caben en una estimación simple**: inmuebles y la categoría «otro». Fuera
  también.

El cálculo supone una **venta total**, que es el único caso exacto con los datos que guarda la
app: para un reembolso parcial, los fondos tributan por orden de antigüedad (FIFO) y haría falta
guardar cada compra por separado. También supone que no hay otras ganancias ni pérdidas ese año,
que se suman a la misma base y pueden cambiar de tramo.

Y una cosa que conviene saber y es puro hecho: **traspasar entre fondos no tributa en España**.
Solo se paga al reembolsar.

Nada de esto es asesoramiento fiscal, y el aviso lo dice.

#### Cada cuánto se actualizan los valores

Depende del modo, y es la diferencia práctica entre los dos:

- **Valor a mano**: nunca solo. Cambia cuando anotas un valor.
- **Precios automáticos**: se piden **al abrir la pestaña**, si la copia guardada tiene más de
  doce horas. No hace falta pulsar nada; el botón sigue ahí para forzarlo.

Doce horas y no menos porque el valor liquidativo se publica una vez al día: pedirlo más a
menudo devuelve exactamente lo mismo y carga a un servicio ajeno. Si la petición falla no se
insiste en cada repintado, solo una vez por hora.

Que los precios estén al día no significa que el valor lo esté: los **títulos** son los del
último extracto que pegaste. Por eso existe el aviso de desfase.

#### Efectivo sin invertir

Las cuentas de inversión suelen tener un saldo pequeño sin colocar. En los ajustes del producto
hay un campo para él, y se suma al valor cuando los precios se buscan solos. Sin eso el total de
la app no cuadra con el del banco por unos euros, y dos números que no cuadran hacen desconfiar
de los dos.

#### Modo discreto

En Ajustes se pueden ocultar todos los importes de un toque, para abrir la app en el metro o
enseñarle algo a alguien sin que vea cuánto tienes. Los datos no se tocan: solo dejan de verse.
Es local al dispositivo y no viaja en la sincronización.

Está hecho con una clase en `<html>` y una regla de CSS sobre `.num`, así que **toda cantidad
que se pinte tiene que llevar esa clase**. Para los importes dentro de una frase existen `eurN()`
y `eurN0()`, que devuelven el importe ya envuelto; `eur()` y `eur0()` se reservan para los textos
planos, donde el marcado se vería literal. Hay una prueba que recorre todas las pantallas con el
modo encendido y falla si queda algún importe legible.

#### Lo que esta app no hace

No te dice qué comprar. Calcula sobre tus datos; no opina sobre el mercado.

### El mes contable

Por defecto el mes es el del calendario. Si cobras a final de mes, eso no cuadra con cómo
piensas tu dinero: lo que gastas el 29 de agosto sale de la nómina de agosto, no de la de
julio. En **Ajustes → Mes contable** eliges el día en que arranca tu mes.

Con el día 28, tu «septiembre» va del **28 de agosto al 27 de septiembre**, ambos incluidos:
el gasto del propio día de cobro ya cae en el mes nuevo. El nombre lo pone el mes que ocupa
casi entero el ciclo, así que con día 28 se llama septiembre, y con día 5 el ciclo que arranca
el 5 de septiembre también se llama septiembre. La frontera está en el día 16.

Un día que no existe en el mes se ajusta al último: con el día 31, febrero empieza el 28 (o el
29 en bisiesto). La barra del mes enseña siempre el rango, para que no haya que adivinarlo.

Esto afecta a **Finanzas**: el listado por meses, el presupuesto, las métricas mensuales y el
gasto medio por día, que se calcula sobre los días del ciclo y no sobre los del mes natural.
No afecta a **Hábitos** ni al resumen anual: sus periodos son del calendario y cambiarlos
reescribiría registros ya guardados.

### El calendario

Dentro de Hábitos, junto a Resumen, hay un **Calendario**. El selector de arriba decide qué se
mide en cada casilla:

| Ámbito | Qué pinta cada casilla |
|---|---|
| Todos los hábitos diarios | cuántos de los que tocaban se cumplieron (`2/3`) |
| Por sección | lo mismo con los hábitos de ese grupo, y con su color |
| Un hábito concreto | si se cumplió, y la cantidad registrada si la tiene |

**La rejilla usa la unidad del hábito, no siempre el día.** Una cuadrícula de treinta casillas
no dice nada de un hábito semanal: repite cuatro datos treinta veces. Por eso un hábito
semanal se dibuja como una fila por semana, con su rango de fechas, y uno mensual como una
rejilla de los doce meses del año, con la navegación pasando a años.

Cada casilla tiene uno de seis estados:

| Estado | Aspecto | Cuándo |
|---|---|---|
| Cumplido | color lleno | se cumplió lo que tocaba |
| Fuera de plan | color lleno, borde discontinuo | **no tocaba, pero lo hiciste** |
| A medias | color al 42% | había algo registrado, pero no llegó al objetivo |
| No cumplido | tinte de alerta | **tocaba y no se hizo** |
| En curso | borde discontinuo con el acento | el día, semana o mes que aún no ha terminado |
| No tocaba | gris hundido | no había nada que cumplir y no se hizo nada |

Dos decisiones de fondo:

**Una sesión fuera de plan cuenta.** Si entrenas un sábado que no tocaba, la casilla se pinta
con el color del hábito: es lo que de verdad hiciste. Suma en un contador aparte,
«Fuera de plan», y nunca resta del porcentaje.

**El periodo en curso no se ha fallado todavía.** El día de hoy, la semana en curso y el mes
en curso no se pintan en rojo ni cuentan como debidos hasta que terminan. Marcar en rojo a
las nueve de la mañana lo que aún puedes cumplir es mentir sobre tus datos.

La leyenda solo enseña los estados que aparecen en lo que estás mirando; no tiene sentido
explicar «fuera de plan» en un calendario donde no hay ninguno.

Tocar una casilla abre lo que corresponde: la hoja de ese hábito si el ámbito es uno solo, o
una hoja con **todo lo que existía ese día** —lo que tocaba primero, y debajo lo que no, para
poder registrar también una sesión fuera de plan—. La rejilla se dibuja siempre, incluso en un
mes sin nada; en ese caso el mensaje va dentro de la propia tarjeta del calendario.

El botón **Hoy** (o **Este año**) aparece en la barra en cuanto te mueves, para volver de un
toque.

### Apariencia

En Ajustes → Apariencia se elige entre **el del sistema**, **claro** y **oscuro**. Con el
primero la app sigue al teléfono, incluido el cambio automático al anochecer; con los otros
dos manda la app. La elección se guarda y se aplica antes de pintar nada, para que no haya un
fogonazo claro al abrir, y arrastra consigo el `theme-color` del navegador: si no, la barra de
estado del iPhone se queda del color contrario.

Las sesiones registradas en días libres no cuentan como obligación pero se suman aparte
como **sesiones fuera de plan**, así que un entrenamiento extra suma sin poder bajar el
porcentaje. El bloque **Acumulado** muestra el total de cada hábito de cantidad o
cronómetro en la ventana elegida: horas entrenadas, páginas leídas, kilómetros.

**Colores.** El color pertenece al grupo, no al hábito, y se asigna solo al crear el primero
de ese grupo. Cambiarlo desde cualquier hábito recolorea todo el grupo.

**Rachas:** cuentan periodos consecutivos cumplidos. Un hábito semanal cuenta semanas y uno
mensual cuenta meses. El periodo en curso no rompe la racha mientras aún pueda completarse.

---

## Integración con Atajos de iOS

### Tras pagar con Apple Pay: el pop-up ya relleno

La automatización de **Transacción** entrega el importe y el comercio de cualquier tarjeta de
Wallet. El atajo se los pasa al Worker, que devuelve una sugerencia, y el pop-up aparece con el
importe y la nota ya escritos y la categoría sugerida la primera de la lista. Nada se guarda
hasta que confirmas.

**Cómo se sugiere la categoría:**

1. **Por historial.** Busca tus gastos anteriores en ese mismo comercio, aunque cambie la tienda
   o la ciudad («MERCADONA 4521 VALENCIA» y «MERCADONA 1120 MADRID» son el mismo). Si una
   categoría reúne al menos el 60% de ellos, se sugiere.
2. **Por reglas**, si nunca pagaste ahí: supermercados, gasolineras, aerolíneas, etc.
3. **Nada**, si no lo reconoce: la lista sale sin sugerencia y tienes que elegir.

Si el historial está repartido (Amazon: a veces Compras, a veces Hogar), no decide por ti,
pero pone esas categorías arriba. Al final de la lista siempre aparece **❓ No definido**,
para cuando no quieras decidir en ese momento; la pestaña Hoy te recuerda lo que queda ahí.

La nota sugerida es la última que escribiste en ese comercio, o su nombre limpio («Mercadona»).
Al guardar se conserva además el nombre original del datáfono en el campo `com`, que es lo que
permite reconocerlo la próxima vez aunque edites la nota.

Atajos no permite dejar marcada de antemano una opción de una lista: por eso la sugerida va
la primera con ✓ y basta un toque.

**El atajo** (automatización → Transacción → tus tarjetas → *Notificar* en vez de *Ejecutar
inmediatamente*):

1. **Obtener contenido de URL**: `POST https://TU-WORKER.workers.dev/sugerir`, encabezado
   `Authorization: Bearer TU_CLAVE`, cuerpo JSON con `comercio` (Texto: *Entrada del atajo →
   Comerciante*) e `importe` (Texto: *Entrada del atajo → Importe*).
2. **Obtener valor del diccionario** `c` → **Pedir entrada** Número, `¿Cuánto?`, respuesta por
   omisión ese valor → **Establecer variable** `importe`.
3. **Obtener valor del diccionario** `lista` → **Elegir de la lista**, indicación: el valor
   `pregunta` → **Establecer variable** `categoria`.
4. **Obtener valor del diccionario** `n` → **Pedir entrada** Texto, `Nota`, respuesta por omisión
   ese valor → **Establecer variable** `nota`.
5. **Obtener contenido de URL**: `POST …/col/gastos` con `c` = `importe`, `cat` = `categoria`,
   `n` = `nota`, `com` = *Comerciante*.
6. **Mostrar notificación**: `Guardado`.

Cada *Obtener valor del diccionario* toma como diccionario el resultado del paso 1: al elegir
la variable, pulsa sobre ella y selecciona *Contenido de URL*.

La categoría se envía tal cual la muestra la lista («✓ 🍽 Comida») y el Worker la traduce a su
identificador, así que **no hace falta mantener en el atajo la lista de identificadores**:
las categorías nuevas aparecen solas.

Limitaciones del disparador, todas de Apple: solo salta con pagos sin contacto (ni compras web
ni tarjeta física); a veces salta también con pagos rechazados; a veces falla esperando los
datos del pago; y necesita que Wallet tenga permiso para usar datos móviles
(Ajustes → Apps → Wallet).

### Tarjeta compartida: registro automático dividido entre dos

Para una tarjeta compartida (por ejemplo, una Revolut con tu pareja), en el móvil de la otra
persona el atajo no pregunta nada: manda el pago al Worker y este lo **divide entre dos**, le
pone categoría y nota con el mismo sistema que el pop-up, y lo deja marcado **«por revisar»**.
En tu app aparece en Hoy una tarjeta «N gastos compartidos por revisar»; dentro, cada uno se
confirma con ✓, se corrige tocándolo (al guardar queda revisado) o se confirman todos a la vez.

**Una clave aparte para el otro móvil.** El Worker acepta una segunda clave, `CLAVE_AUTO`, que
solo sirve para esta ruta: con ella se pueden añadir gastos compartidos, pero no leer ni
modificar nada más. Así tu clave principal no sale de tus dispositivos.

```powershell
# Genera la clave limitada y déjala en el portapapeles
$b = New-Object byte[] 32
(New-Object System.Security.Cryptography.RNGCryptoServiceProvider).GetBytes($b)
[Convert]::ToBase64String($b) | Set-Clipboard
# Súbela como secreto, sin pegar nada a mano
Get-Clipboard | npx wrangler secret put CLAVE_AUTO
```

**El atajo en el otro móvil** (Automatización → Transacción → solo la tarjeta compartida →
**Ejecutar inmediatamente** activado y **Notificar al ejecutar** desactivado):

1. **Obtener contenido de URL**: `POST https://TU-WORKER.workers.dev/auto`, encabezado
   `Authorization: Bearer CLAVE_AUTO`, cuerpo JSON con tres campos de tipo Texto:
   `comercio` (*Entrada del atajo → Comerciante*), `importe` (*Entrada del atajo → Importe*) y
   `quien` (su nombre, escrito a mano).

Es la única acción. Si alguna vez el reparto no es a medias, se añade un campo `reparto`
(Número) con el número de partes.

Para que la tarjeta compartida funcione igual cuando pagas tú, crea en tu móvil la misma
automatización para esa tarjeta, con tu nombre en `quien`, y **desmárcala** en la automatización
del pop-up: así todos los gastos de esa tarjeta siguen el mismo camino, sin importar quién pague.

Como el atajo corre sin que nadie mire, un fallo pasa desapercibido: un día de bloqueo de
LaLiga, un pago con la tarjeta física o una compra online no quedan registrados. Y como el
disparador salta a veces con pagos rechazados, conviene echar un ojo a la bandeja antes de
confirmar todo.

### Atajo manual

Para efectivo o cualquier gasto sin pago con el móvil, un atajo sencillo sin la sugerencia:

1. **Pedir entrada** → tipo Número → `¿Cuánto?`
2. **Lista** con los identificadores de tus categorías, en minúsculas. Los iniciales son
   `comida`, `transporte`, `compras`, `ocio`, `hogar`, `salud`, `viajes`, `otros`.
   Si creas categorías nuevas, mira su identificador en Ajustes → Gestionar categorías
   y añádelo a esta lista
3. **Elegir de la lista** → mensaje `Categoría`
4. **Pedir entrada** → tipo Texto → `Nota (opcional)`
5. **Obtener contenido de una URL**:
   - URL: `https://TU-WORKER.workers.dev/col/gastos`
   - Método: `POST`
   - Encabezado: `Authorization` = `Bearer TU_CLAVE`
   - Cuerpo: JSON con `c` (Número, la entrada del paso 1), `cat` (Texto, el elemento elegido)
     y `n` (Texto, la entrada del paso 4)

El campo `n` es la nota y admite hasta 120 caracteres. Si lo dejas vacío, el movimiento se
muestra con el nombre de su categoría, igual que antes.

Ese atajo se puede disparar desde **Tocar atrás** o desde el **Botón Acción**.

También puedes abrir la app en un punto concreto con parámetros de URL:

| Parámetro | Efecto |
|---|---|
| `?add=1` | Abre directamente el teclado de gastos |
| `?ver=habitos` | Abre un módulo: `hoy`, `finanzas`, `habitos` o `ajustes` |
| `?cat=comida` | Preselecciona una categoría |

---

## Importar movimientos desde CSV

En **Ajustes → Importar movimientos desde CSV**. Pega el contenido del archivo, pulsa
*Analizar* para ver el recuento, y confirma.

```csv
fecha;importe;categoria;nota;tipo
06/09/2026;12,40;comida;Menú del día;gasto
05/09/2026;3,50;;MERCADONA;gasto
04/09/2026;1200;;Nómina de septiembre;ingreso
```

| Columna | Obligatoria | Formato |
|---|---|---|
| `fecha` | Sí | `dd/mm/aaaa` o `aaaa-mm-dd` |
| `importe` | Sí | Coma o punto decimal. El signo se ignora |
| `categoria` | No | Identificador o nombre visible de cualquiera de tus categorías |
| `nota` | No | Texto, hasta 60 caracteres |
| `tipo` | No | `ingreso` o `gasto`. Por defecto `gasto` |

- El separador puede ser punto y coma o coma; se detecta solo.
- La fila de cabecera es opcional. Sin ella, se asume ese orden de columnas.
- Si `categoria` va vacía, se deduce del concepto con el mismo sistema que el pop-up del
  atajo: primero tu historial en ese comercio y luego las reglas. Lo que no reconoce va a
  **No definido**.
- **Duplicados:** se omite cualquier fila con la misma fecha e importe que un movimiento ya
  registrado, así que puedes reimportar el mismo archivo sin miedo.

---

## Modelo de datos

Seis colecciones. Todos los items comparten `id` (identificador único) y `t` (marca de
tiempo en milisegundos). El campo `pend` es local: marca lo que aún no ha subido y nunca
se envía al servidor.

**gastos**
```js
{ id, t, c: 12.4, cat: 'comida', n: 'Menú del día', tipo: 'gasto' | 'ingreso',
  com: 'MERCADONA S.A. 4521' }   // com: comercio original, si vino de un pago o un CSV
```
Los gastos de la tarjeta compartida añaden `compartido` (entre cuántos se divide), `total`
(el importe completo del pago), `quien` (quién pagó) y `revisar: true` hasta que los confirmas.
`c` es siempre tu parte, así que métricas y presupuestos cuentan solo lo que te corresponde.

**habitos**
```js
{ id, t, nombre: 'Leer', grupo: 'Ocio', emo: '📖', color: '#3E6FA8',
  tipo: 'sino' | 'cantidad' | 'crono',
  frec: 'dia' | 'semana' | 'mes',
  dias: [1,2,3,4,5],        // 1 lunes … 7 domingo. Vacío = todos los días
  cuenta: true,             // false = solo seguimiento: nunca se cumple ni puntúa
  objetivo: 20, unidad: 'páginas', paso: 1, orden: 0, archivado: false }
```

**registros** — uno por hábito y periodo
```js
{ id: 'k3f9_2026-09-07', hab: 'k3f9', d: '2026-09-07', v: 24, t }
```

La clave de periodo `d` determina a qué unidad de tiempo pertenece:

| Periodicidad | Formato de `d` | Ejemplo |
|---|---|---|
| Cada día | `aaaa-mm-dd` | `2026-09-07` |
| Cada semana | `s` + lunes de esa semana | `s2026-09-07` |
| Cada mes | `m` + `aaaa-mm` | `m2026-09` |

Las semanas empiezan en lunes. Cambiar la periodicidad de un hábito no borra su historial:
los registros antiguos quedan con claves de otro formato y dejan de contar, pero reaparecen
si vuelves a la periodicidad original.

**categorias**
```js
{ id: 'comida', t, nom: 'Comida', emo: '🍽', color: '#C7513F', orden: 0, archivada: false }
```
La categoría `no-definido` se crea sola. Las categorías iniciales llevan en local una marca
`_semilla` que nunca se sube: si el servidor ya tiene esa categoría, quizá renombrada desde
otro dispositivo, se adopta la del servidor en vez de pisarla con los valores por defecto.

**fijos** — plantillas de gasto recurrente
```js
{ id, t, nom: 'Alquiler', c: 750, cat: 'hogar', diaMes: 1, activo: true, ultimo: '2026-09' }
```
El campo `ultimo` guarda el mes en que se generó por última vez, para no duplicar.
Los movimientos que crean llevan `fijo` con el id de su plantilla.

### Claves de `localStorage`

Conservan el prefijo `vida.` del nombre anterior del proyecto. **No las cambies:** hacerlo
dejaría la app vacía en todos los dispositivos, porque no sabría dónde buscar los datos ya
guardados.

```
vida.gastos  vida.habitos  vida.registros
vida.cola.<colección>      ids borrados pendientes de subir
vida.nube                  { url, clave }
vida.ajuste.catsSembradas    true una vez creadas las categorías iniciales
vida.ajuste.presupuesto      número, presupuesto del mes
vida.ajuste.presupuestos     { categoría: tope } límites por categoría
vida.ajuste.crono          { hab, inicio }
vida.ajuste.coloresGrupo   { grupo: color } — caché; el color viaja en cada hábito
vida.ajuste.coloresNota    { categoría: color } — caché; el color viaja en cada nota
vida.ultimaSync            marca de tiempo
```

---

## API del Worker

Todas las rutas exigen la cabecera `Authorization: Bearer <clave>`, salvo `/salud`.

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/salud` | Comprobación de vida. No pide clave |
| `GET` | `/col` | Índice de colecciones con su número de items |
| `GET` | `/col/<nombre>` | `{ items: [...], borrados: [ids] }` |
| `POST` | `/col/<nombre>` | Inserta o actualiza. Acepta un objeto o un array |
| `POST` | `/col/<nombre>/borrados` | Marca ids como borrados. Acepta uno o un array |
| `POST` | `/sugerir` | `{ comercio, importe }` → importe limpio, nota, categoría sugerida y lista ordenada. No guarda nada |
| `POST` | `/auto` | `{ comercio, importe, quien?, reparto? }` → guarda un gasto compartido dividido y por revisar. Admite la clave limitada |

Hay dos claves: `CLAVE`, la principal, sirve para todo; `CLAVE_AUTO`, opcional, solo para `/auto`.

Las rutas antiguas `/gastos` y `/borrados` siguen funcionando como alias de
`/col/gastos`, por compatibilidad con la primera versión de la app.

**Comportamiento a tener en cuenta**

- Un `POST` sobre un id con lápida se ignora: lo borrado no resucita.
- Los importes aceptan coma decimal, porque Atajos en español la produce.
- Si ningún item del lote es válido, responde `400` en lugar de callar.
- Límites: 500 items por petición, 20.000 por colección, 4.000 caracteres por item.

**Códigos de error**

| Código | Significado |
|---|---|
| `400` | Cuerpo mal formado, o ningún item válido |
| `401` | Clave incorrecta o ausente |
| `404` | Ruta inexistente |
| `413` | Demasiados items en una sola petición |
| `507` | La colección alcanzó su límite |

---

### `GET|POST /vl`

Valor liquidativo de uno o varios fondos por ISIN, o precio por ticker. Por GET,
`?isin=LU0000000000,AAPL`; por POST, `{"isin": ["LU0000000000"]}`. Añade `?forzar=1` para saltarse la caché.

```json
{ "vl": { "LU0000000000": { "nav": 8.2229, "moneda": "USD", "navEur": 7.3255, "tasa": 0.89087,
                            "fecha": "2026-10-01", "nom": "FONDO DE EJEMPLO",
                            "fuente": "quefondos", "cacheado": false } },
  "pedido": 1759600000000 }
```

`navEur` es lo que hay que usar para sumar: el `nav` viene en la divisa del fondo. El tipo de
cambio sale de `https://api.frankfurter.dev` (datos del BCE, sin clave) y se cachea aparte, en
`fx:<DIVISA>`.

Máximo 25 ISIN por petición. Se cachea doce horas en KV bajo `vl:<ISIN>`, y además se guarda
sin caducidad en `vlult:<ISIN>` como último recurso: si un día la fuente no responde, es mejor
devolver el valor de ayer que un error.

## Sincronización y modo sin conexión

Cada escritura se guarda en el dispositivo y se marca como pendiente. La subida se
intenta al momento, y si falla queda en cola. Los pendientes se muestran con un punto
naranja en la lista y un globo naranja sobre la pestaña de Ajustes.

La sincronización se dispara al abrir la app, al recuperar la conexión, al volver a ella
tras veinte segundos fuera, y después de cada escritura.

**Resolución de conflictos.** Manda el servidor, salvo que el dispositivo tenga cambios sin
subir para ese mismo item, en cuyo caso ganan los locales. Los borrados dejan una lápida en
el servidor para que no reaparezcan desde otro dispositivo que llevara tiempo desconectado.

Dos detalles que evitan fallos sutiles:

- **Desmarcar un hábito no borra su registro**, lo pone a cero. Un borrado dejaría lápida
  y ese periodo no se podría volver a marcar nunca.
- **Deshacer un borrado crea el item con un identificador nuevo**, porque el servidor ya
  puede tener la lápida del anterior y volvería a eliminarlo en la siguiente sincronización.

---

## Copias de seguridad

**Ajustes → Descargar copia de seguridad** genera un JSON con las cuatro colecciones.
Guárdalo en iCloud Drive de vez en cuando.

Merece la pena aunque uses el Worker: el plan gratuito de Cloudflare no caduca, pero
depender de un único servicio sin copia local es cambiar un riesgo por otro.

**Restaurar desde copia** añade lo que falte sin tocar lo que ya haya, comparando por `id`,
así que no genera duplicados. Acepta tanto el formato actual como el array suelto de gastos
de las primeras versiones.

---

## Desarrollo

No hay compilación ni dependencias: son módulos nativos de JavaScript. Cualquier servidor
estático vale, pero **no abras `index.html` con doble clic**, porque el protocolo `file://`
bloquea los módulos.

```bash
python3 -m http.server 8000
# o
npx serve
```

Y abre `http://localhost:8000`.

Las escrituras individuales guardan, repintan y sincronizan al momento. Para operaciones
masivas (importar un CSV, borrar todo, reordenar) hay que envolverlas en `enLote()` del
núcleo, que aplaza todo eso al final: sin ella, importar 300 movimientos lanzaba 300
peticiones al Worker y 300 repintados.

El service worker ya no se releva solo: instala la versión nueva y espera. La app detecta
que hay una esperando y ofrece un aviso con botón **Recargar**; solo entonces se le da el
relevo y la página se recarga una vez. Así no se cambia el código bajo los pies del usuario
a mitad de registrar un gasto, y deja de hacer falta cerrar la app dos veces para ver los
cambios.

**Al desplegar un cambio, sube el número de caché en `sw.js`:**

```js
const CACHE = 'myapp-v5';   // -> 'myapp-v6'
```

Si no, el service worker puede seguir sirviendo la versión anterior. La estrategia es red
primero con la caché como respaldo, así que normalmente el cambio llega solo, pero el
número de versión garantiza la limpieza de lo viejo.

**Convenciones del código.** Todo en español, incluidos nombres de variables y funciones.
Sin dependencias externas. Los estilos usan variables CSS para que el modo oscuro funcione
sin lógica adicional. Los módulos no se importan entre sí salvo a través de `nucleo.js`,
con dos excepciones deliberadas: `hoy.js` reutiliza las tarjetas de `habitos.js` y los
totales de `finanzas.js`.

---

## Resolución de problemas

**Pantalla en blanco tras publicar.** Los archivos JavaScript no están en `js/`, o
`index.html` no quedó en la raíz del repositorio. Abre la consola del navegador para ver
qué ruta da 404.

**Los cambios no llegan al móvil.** Es el service worker. Cierra la app del todo desde el
multitarea y ábrela dos veces. Si persiste, sube el número de caché en `sw.js` y vuelve a
desplegar.

**"El servidor respondió 404" al sincronizar.** El Worker desplegado es una versión anterior
que no conoce las rutas `/col/...`. Vuelve a desplegar con el `src/worker.js` actual.

**"Clave incorrecta".** Suele ser un espacio o un salto de línea colado al copiar. Vuelve a
introducirla en Ajustes. Si sigue, comprueba con `npx wrangler secret list` que el secreto
se llama exactamente `CLAVE`: si en la lista aparece la propia clave como nombre, se creó
mal y hay que borrarlo y rehacerlo.

**"No se pudo conectar".** La dirección está mal escrita o le falta el `https://`.
Comprueba `/salud` en el navegador.

**Reintentos.** Cuando la sincronización falla por red, la app lo reintenta sola con espera
creciente: 30 s, 1 min, 2, 4… hasta un tope de 15 minutos, y para en cuanto lo consigue. Un
error de clave no se reintenta, porque no se arregla solo. Ajustes indica si hay un reintento
programado.

**Sincroniza sin decir nada, o lleva días parada.** Ajustes → Sincronización → **Diagnóstico**
prueba por separado la red del dispositivo, el Worker sin clave, la lectura autenticada y una
escritura, con los tiempos de cada paso. Las peticiones tienen un tope de 15 segundos: sin él,
una conexión colgada dejaba la sincronización bloqueada hasta reiniciar la app.

**Veo datos distintos en Safari y en el icono.** Es el comportamiento de iOS: almacenamientos
separados. Configura el Worker en ambos.

**Errores de TLS con `curl` o `Invoke-RestMethod` en Windows.** PowerShell 5.1 y algunos
antivirus con inspección HTTPS no negocian bien con Cloudflare. Usa `curl.exe`, PowerShell 7,
o simplemente comprueba desde el navegador.

---

## Limitaciones conocidas

- **Sin notificaciones.** Una aplicación web instalada en iOS no puede avisarte con la app
  cerrada. El pomodoro solo suena si la tienes abierta; el tiempo, en cambio, se calcula
  desde la hora de inicio, así que puedes bloquear el móvil sin perder la cuenta.
- **Atajos no puede abrir el icono de la pantalla de inicio.** Los iconos de aplicación web
  no son apps y no se pueden invocar desde Atajos. Por eso el atajo escribe directamente
  contra el Worker en lugar de abrir la app.
- **La sincronización no está cifrada de extremo a extremo.** Cualquiera con la URL y la
  clave puede leer y escribir. Lo almacenado son importes, categorías y hábitos, sin datos
  bancarios, pero conviene saberlo.
- **El almacenamiento del navegador es frágil.** Si borras los datos de sitios web en
  Safari, se va la copia local. Con el Worker configurado se recupera al reconectar.
- **Un solo cronómetro a la vez.** Arrancar uno detiene el anterior y guarda su tiempo.

---

## Ideas pendientes

- Gastos recurrentes marcados como fijos, para separarlos de los variables en la proyección
- Cruzar módulos: comparar gasto con cumplimiento de hábitos
- Reordenar hábitos arrastrando en lugar de con botones
- Vista de calendario mensual por hábito, para ver huecos de un vistazo
- Rotar la clave sin tener que actualizarla a mano en cada dispositivo
