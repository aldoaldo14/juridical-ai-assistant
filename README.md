# Juridical AI Assistant

Soy investigador legal pero un completo novato en modelos locales de IA, tengo una computadora con RTX 5070 12gbVRAM capaz de correr modelos como "PaddleOCR-VL-1.6" para hacer OCR y registro en JSON de variables de investigacion y "Gemma 4 12B" para codificar y encontrar relaciones, ambos sobre artículos de investigación jurídicos y datos estadísticos. Me gustaría una app que pudiera hacer correr los procesos necesarios en mi computadora a través de red local de manera fácil, solamente proporcionándole los archivos PDF. Me gustaría poder configurarlas dentro de la app según el tema o proyecto. Primero compara el rendimiento de Gemma 4 12B cuantizado y PaddleOCR-VL-1.6 en mi equipo antes de fijar la arquitectura. Diseña una prueba paso a paso para comparar ambos modelos en mi RTX 5070, con herramientas sencillas y mediciones de tiempo por página. Ok, prosigamos a crear la app para eso. La interfaz la usaré solo en la computadora con la RTX 5070, no necesito acceso desde otros dispositivos de la red local. No fijes de antemano el runtime o la arquitectura local, ni des por medido el rendimiento de los modelos en mi equipo.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/edfb8724-09ab-4c39-a0d3-38f0da08f931).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
