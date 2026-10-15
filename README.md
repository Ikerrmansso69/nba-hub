# 🏀 NBA Hub

Web sobre la NBA en español: próximos partidos, temporada regular, clasificación, NBA Cup, campeones históricos, historia, equipos y jugadores.

**👉 Ver la web:** https://ikerrmansso69.github.io/nba-hub/

## Secciones

| Sección | Contenido |
|---|---|
| **Inicio** | Cuenta atrás para la temporada 2026-27, campeón vigente y próximos partidos (7 días, en vivo) |
| **Partidos** | Calendario de temporada regular día a día, con resultados y partidos en directo |
| **Clasificación** | Conferencias Este y Oeste, con zonas de playoffs y play-in |
| **NBA Cup** | Formato del torneo, calendario 2026, todas las finales (2023-2025) y partidos de la Copa |
| **Campeones** | Todas las Finales desde 1947 con MVP, buscador, filtro por décadas y gráfico de anillos por franquicia |
| **Historia** | Línea temporal de la liga desde 1891 hasta hoy |
| **Equipos** | Galería con los logos de los 30 equipos; al pulsar, ficha con datos, títulos y plantilla con fotos |
| **Jugadores** | Plantillas actuales de cada equipo (con foto, dorsal, posición, altura…) y leyendas históricas |
| **Récords y Trivia** | Récords míticos y un quiz de preguntas NBA |

## Cómo funciona

- HTML + CSS + JavaScript puro, sin dependencias ni compilación.
- Los datos **en vivo** (calendario, resultados, clasificación, plantillas, fotos) vienen de la API pública de ESPN (`site.api.espn.com`).
- Los datos **históricos** (finales, NBA Cup, historia, récords, leyendas, trivia) están en `js/data.js` y se pueden ampliar fácilmente.
- Si la API no responde, la portada muestra los partidos de la noche inaugural como respaldo.

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
```

## Aviso

Proyecto de aficionado sin relación oficial con la NBA ni con ESPN. Logos e imágenes pertenecen a sus respectivos propietarios.
