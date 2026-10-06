# The Agent Pets landing page, and nothing else: nginx serving the one self-contained file site/index.html.
# The Windows app, its Rust crates and its tooling are not part of the image; .dockerignore keeps them out of the
# build context as well. site/index.html is committed already built (see tools/site), so no build step runs here.
#
#   docker build -t agent-pets-site .
#   docker run -p 8080:80 agent-pets-site        → http://localhost:8080
FROM nginx:1.30-alpine
COPY site/nginx.conf /etc/nginx/conf.d/default.conf
COPY site/index.html /usr/share/nginx/html/index.html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD wget -qO /dev/null http://127.0.0.1/healthz || exit 1
