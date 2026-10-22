# 🏀 NBA Hub

Web sobre la NBA en español: próximos partidos, temporada regular, clasificación, NBA Cup, campeones históricos, historia, equipos y jugadores.

**👉 Ver la web:** https://ikerrmansso69.github.io/nba-hub/

## Secciones

| Sección | Contenido |
|---|---|
| **Inicio** | Cuenta atrás para la temporada 2026-27, campeón vigente y próximos partidos (7 días, en vivo) |
| **Hoy** | Todos los partidos de la jornada en una vista estilo Flashscore: en directo, por jugar y finalizados, con parciales y marcadores que parpadean al cambiar |
| **Multipartido** | Hasta 4 partidos a la vez con marcador, parciales, máximos anotadores y últimas jugadas; avisos de **final apretado** (≤5 puntos en los 3 últimos minutos) |
| **Noticias** | Última hora que se actualiza sola cada minuto (con aviso emergente y notificaciones del navegador), filtros de lesiones/fichajes/partidos, parte de lesiones de toda la liga y movimientos de plantilla |
| **Partidos** | Calendario día a día con filtro En directo / Finalizados / Próximos; los marcadores se refrescan solos |
| **Ficha de partido** | Estilo Flashscore: crónica automática, gráfico de evolución del marcador, estadísticas por cuarto, imagen del resultado para compartir, marcador en vivo, parciales, probabilidad de victoria, líderes, estadísticas de equipo, quintetos sobre la pista (probables antes del partido), box score, jugada a jugada, mapa de tiro y bajas |
| **Clasificación** | Conferencias Este y Oeste, cuadro de playoffs, rachas y récords de la temporada |
| **NBA Cup** | Formato del torneo, calendario 2026, todas las finales (2023-2025) y partidos de la Copa |
| **Campeones** | Todas las Finales desde 1947 con MVP, buscador, filtro por décadas y gráfico de anillos por franquicia |
| **Historia** | Línea temporal de la liga desde 1891 hasta hoy |
| **Equipos** | Galería con los logos de los 30 equipos; al pulsar, ficha con datos, títulos y plantilla con fotos |
| **Jugadores** | Plantillas actuales de cada equipo (con foto, dorsal, posición, altura…) y leyendas históricas |
| **Ficha de equipo** | Calendario completo con resultados, botón para añadir todos sus partidos a tu calendario (.ics / Google Calendar), forma reciente, líderes, bajas y plantilla |
| **Buscador** | Ctrl+K o / para ir a cualquier equipo, jugador o sección |
| **Mis equipos** | Marca tus equipos con ⭐: su próximo partido, último resultado y noticias en la portada, y avisos cuando empiezan o terminan sus partidos |
| **Fichas de jugador** | Promedios de la temporada, biografía y últimos partidos con gráfico de puntos |
| **Carrera por el MVP** | Ranking con un índice propio (no oficial) basado en estadísticas y victorias |
| **Comparador** | Dos jugadores cara a cara, estadística por estadística |
| **Cuadro de playoffs** | Proyección de play-in y playoffs con la clasificación del día |
| **Juegos** | Porra diaria con liga entre amigos (por código, sin registro), Adivina el jugador, trivia con reloj de 24 s y récords |
| **Historia** | Línea temporal, todos los MVP, números 1 del Draft desde 1980 y dorsales retirados |

## Cómo funciona

- HTML + CSS + JavaScript puro, sin dependencias ni compilación.
- Los datos **en vivo** (calendario, resultados, clasificación, plantillas, fotos, noticias, lesiones y estadísticas de partido) vienen de la API pública de ESPN (`site.api.espn.com`). Las noticias llegan en inglés, tal como las publica ESPN.
- Los datos **históricos** (finales, NBA Cup, historia, récords, leyendas, trivia) están en `js/data.js` y se pueden ampliar fácilmente.
- Si la API no responde, la portada muestra los partidos de la noche inaugural como respaldo.

## Copia de respaldo de los datos

La tarea de GitHub Actions `.github/workflows/datos.yml` ejecuta `scripts/snapshot.mjs` cada 5 minutos y guarda en la rama `data` una copia de calendario, clasificación, noticias, lesiones, movimientos, fichas de los partidos cercanos, plantillas y estadísticas de jugadores. Si el navegador no puede leer la API de ESPN, la web usa esa copia y lo indica con un aviso en la esquina.

## App instalable

La web incluye `manifest.webmanifest` y un service worker (`sw.js`), así que se puede **añadir a la pantalla de inicio** del móvil (en Android/Chrome aparece el botón ⤓ en la barra superior; en iPhone, *Compartir → Añadir a pantalla de inicio*). También tiene tema claro/oscuro (botón ◐).

## Ejecutar en local

```bash
git clone https://github.com/Ikerrmansso69/nba-hub.git
cd nba-hub
python3 -m http.server 8000
# abre http://localhost:8000
```

## Estructura

```
index.html      # Página y secciones
css/styles.css  # Estilos (tema oscuro, responsive)
js/data.js      # Datos estáticos: equipos, finales, NBA Cup, historia, récords, trivia
js/api.js       # Cliente de la API de ESPN
js/app.js       # Lógica de la interfaz y navegación
js/news.js      # Noticias en directo, lesiones, movimientos y avisos
js/game.js      # Ficha de partido en directo
js/players.js   # Fichas de jugador, comparador y líderes
scripts/        # Copia de respaldo de los datos (GitHub Actions)
sw.js           # Service worker (app instalable)
```

## Aviso

Proyecto de aficionado sin relación oficial con la NBA ni con ESPN. Logos e imágenes pertenecen a sus respectivos propietarios.

## Contador de visitas (opcional)

La web está preparada para [GoatCounter](https://www.goatcounter.com/), un contador gratuito y sin cookies. Crea una cuenta, elige un código (por ejemplo `nbahub`) y ponlo en la constante `GOATCOUNTER` de `js/app.js`.
