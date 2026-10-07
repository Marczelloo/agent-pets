# The Agent Pets landing page, and nothing else: nginx serving the one self-contained file site/index.html
# (plus the icons, link-preview image and robots.txt that crawlers fetch by URL).
# The Windows app, its Rust crates and its tooling are not part of the image; .dockerignore keeps them out of the
# build context as well. site/index.html is committed already built (see tools/site), so no build step runs here.
#
#   docker build -t agent-pets-site .
#   docker run -p 8080:80 agent-pets-site        → http://localhost:8080
FROM nginx:1.30-alpine
COPY site/nginx.conf /etc/nginx/conf.d/default.conf
# the page, its icons and link-preview image, robots.txt (and sitemap.xml when the build knows the site's URL)
COPY site/index.html site/*.ico site/*.png site/*.txt site/*.xml /usr/share/nginx/html/
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD wget -qO /dev/null http://127.0.0.1/healthz || exit 1
