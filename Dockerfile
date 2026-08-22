FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
# `npm ci` statt `npm install`: gebaut wird exakt das, was package-lock.json
# festhält und was Tests und CI geprüft haben.
#
# Vorher stand hier `npm install`. Zusammen mit `"latest"` in package.json hieß
# das: JEDER Build konnte andere Fassungen ziehen als der davor — der Container
# enthielt dann Code, den nie jemand getestet hat. Gemessen war das keine
# Theorie: `"react": "latest"` hatte das Projekt bereits still von React 18 auf
# 19 gehoben. Die Abhängigkeiten sind deshalb jetzt festgenagelt UND der Build
# liest ausschließlich das Lockfile.
#
# `npm ci` bricht ab, wenn package.json und package-lock.json auseinanderlaufen.
# Das ist erwünscht: ein solcher Build DARF nicht durchgehen.
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
