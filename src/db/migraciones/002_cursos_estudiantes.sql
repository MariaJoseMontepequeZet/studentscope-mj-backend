CREATE TABLE planes (
  nombre VARCHAR(20) PRIMARY KEY,
  precio_usd NUMERIC(8, 2) NOT NULL CHECK (precio_usd > 0)
);

INSERT INTO planes (nombre, precio_usd) VALUES
  ('Básico', 29.99),
  ('Estándar', 59.99),
  ('Premium', 99.99);

CREATE TABLE cursos (
  id BIGSERIAL PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL CHECK (char_length(btrim(nombre)) > 0),
  categoria VARCHAR(20) NOT NULL
    CHECK (categoria IN ('web', 'data', 'devops', 'mobile', 'design', 'seguridad', 'marketing')),
  nivel VARCHAR(20) NOT NULL CHECK (nivel IN ('Básico', 'Intermedio', 'Avanzado')),
  semanas SMALLINT NOT NULL CHECK (semanas > 0),
  plan VARCHAR(20) NOT NULL REFERENCES planes (nombre),
  instructor VARCHAR(100) NOT NULL,
  descripcion TEXT NOT NULL
);

CREATE UNIQUE INDEX cursos_nombre_unico ON cursos (lower(nombre));

INSERT INTO cursos (nombre, categoria, nivel, semanas, plan, instructor, descripcion) VALUES
  ('Desarrollo Web', 'web', 'Básico', 12, 'Básico', 'Carlos López', 'HTML, CSS y JavaScript desde cero. Crea tu primer sitio web responsivo.'),
  ('Full Stack Web', 'web', 'Avanzado', 16, 'Premium', 'Valentina Torres', 'React + Node.js + PostgreSQL. Arquitectura cliente-servidor completa.'),
  ('Diseño UX/UI', 'design', 'Intermedio', 10, 'Básico', 'Sofía Jiménez', 'Figma, prototipos y principios de experiencia de usuario.'),
  ('Python y Data Science', 'data', 'Intermedio', 14, 'Estándar', 'Felipe González', 'Pandas, NumPy, visualización y machine learning con scikit-learn.'),
  ('DevOps y Cloud', 'devops', 'Avanzado', 14, 'Premium', 'Daniela Vargas', 'Docker, Kubernetes, CI/CD y despliegue en AWS.'),
  ('React Native', 'mobile', 'Intermedio', 10, 'Estándar', 'Diego Mendoza', 'Aplicaciones móviles iOS y Android con un solo codebase.'),
  ('SQL y Bases de Datos', 'data', 'Básico', 8, 'Básico', 'Miguel Castro', 'PostgreSQL, consultas avanzadas, índices y optimización.'),
  ('Marketing Digital', 'marketing', 'Básico', 8, 'Básico', 'Camila Ruiz', 'SEO, SEM, redes sociales y analítica web con Google Analytics.'),
  ('TypeScript Avanzado', 'web', 'Avanzado', 8, 'Estándar', 'Alejandro Ortega', 'Tipos, generics, decoradores y patrones de diseño en TS.'),
  ('Vue.js desde Cero', 'web', 'Intermedio', 10, 'Estándar', 'Laura Moreno', 'Composition API, Vuex/Pinia y despliegue de SPAs.'),
  ('Machine Learning con Python', 'data', 'Avanzado', 16, 'Premium', 'Adriana Molina', 'Regresión, clasificación, redes neuronales y MLOps.'),
  ('AWS Solutions Architect', 'devops', 'Avanzado', 12, 'Premium', 'Claudia Patiño', 'Certificación SAA-C03: EC2, S3, Lambda y arquitecturas serverless.'),
  ('Flutter & Dart', 'mobile', 'Intermedio', 12, 'Estándar', 'Iván Bermúdez', 'Apps multiplataforma con Material 3 y Riverpod.'),
  ('Ciberseguridad Básica', 'seguridad', 'Básico', 8, 'Básico', 'Hernán Zapata', 'OWASP Top 10, pentesting ético y protección de APIs.'),
  ('Node.js & APIs REST', 'web', 'Intermedio', 10, 'Estándar', 'Gustavo Londoño', 'Express, autenticación JWT, documentación con Swagger.'),
  ('Docker & Kubernetes', 'devops', 'Intermedio', 10, 'Estándar', 'Mateo Salcedo', 'Contenedores, orquestación y pipelines de despliegue.'),
  ('Power BI & Tableau', 'data', 'Básico', 6, 'Básico', 'Juliana Franco', 'Dashboards interactivos y visualización de datos de negocio.'),
  ('Angular 17', 'web', 'Avanzado', 14, 'Premium', 'Roberto Castillo', 'Signals, standalone components, SSR y arquitectura empresarial.'),
  ('Kotlin para Android', 'mobile', 'Intermedio', 12, 'Estándar', 'Sandra Quintero', 'Jetpack Compose, Coroutines y MVVM con Clean Architecture.'),
  ('Swift & iOS Development', 'mobile', 'Avanzado', 14, 'Premium', 'David Navarro', 'SwiftUI, Combine, Core Data y publicación en App Store.'),
  ('Inteligencia Artificial', 'data', 'Avanzado', 18, 'Premium', 'Isabella Suárez', 'LLMs, prompt engineering, RAG y despliegue de modelos de IA.'),
  ('GraphQL & Apollo', 'web', 'Intermedio', 8, 'Estándar', 'Camilo Ramírez', 'Schemas, resolvers, subscriptions y Apollo Server.'),
  ('Terraform & IaC', 'devops', 'Avanzado', 10, 'Premium', 'Sebastián Rojas', 'Infraestructura como código con Terraform y Ansible en AWS/GCP.'),
  ('Diseño de Producto Digital', 'design', 'Intermedio', 10, 'Estándar', 'Paola Silva', 'Design thinking, sistemas de diseño y handoff con Figma.'),
  ('MongoDB & NoSQL', 'data', 'Básico', 6, 'Básico', 'Natalia Vega', 'Documentos, agregaciones, índices y Atlas en la nube.'),
  ('Next.js & SSR', 'web', 'Avanzado', 10, 'Premium', 'Marcela Acosta', 'App Router, Server Components, Edge Runtime y deployment.'),
  ('Ethical Hacking', 'seguridad', 'Avanzado', 14, 'Premium', 'Fernando Ospina', 'Recon, explotación, post-explotación y reporte de vulnerabilidades.'),
  ('Excel & Google Sheets Pro', 'marketing', 'Básico', 4, 'Básico', 'Ana Martínez', 'Tablas dinámicas, macros VBA, fórmulas avanzadas y automatización.'),
  ('Git & GitHub Avanzado', 'web', 'Básico', 4, 'Básico', 'Santiago Herrera', 'Branching, rebase, hooks, GitHub Actions y code review.'),
  ('Scrum & Gestión Ágil', 'marketing', 'Básico', 4, 'Básico', 'Nicolás Reyes', 'Ceremonias Scrum, Kanban, OKRs y herramientas como Jira y Notion.');

CREATE TABLE estudiantes (
  id BIGSERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL CHECK (char_length(btrim(nombre)) > 0),
  apellido VARCHAR(100) NOT NULL CHECK (char_length(btrim(apellido)) > 0),
  email VARCHAR(254) NOT NULL,
  ciudad VARCHAR(60) NOT NULL CHECK (char_length(btrim(ciudad)) > 0),
  curso_id BIGINT NOT NULL REFERENCES cursos (id) ON DELETE RESTRICT,
  plan VARCHAR(20) NOT NULL REFERENCES planes (nombre),
  progreso SMALLINT NOT NULL CHECK (progreso BETWEEN 0 AND 100),
  fecha_inscripcion DATE NOT NULL CHECK (fecha_inscripcion >= DATE '2023-01-01'),
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX estudiantes_email_unico ON estudiantes (lower(email));
CREATE INDEX estudiantes_curso_idx ON estudiantes (curso_id);
CREATE INDEX estudiantes_ciudad_idx ON estudiantes (ciudad);
CREATE INDEX estudiantes_activo_idx ON estudiantes (activo);
