FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    MODELO_DIR=/modelo

WORKDIR /servicio

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY datos ./datos

RUN useradd --system --no-create-home servicio && mkdir -p /modelo && chown servicio /modelo
USER servicio

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/salud').status == 200 else 1)"

CMD ["uvicorn", "app.servicio:app", "--host", "0.0.0.0", "--port", "8000"]
