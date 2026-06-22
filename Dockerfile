# Use standard Python
FROM python:3.10

# Set the working directory inside the Hugging Face server
WORKDIR /code

# Copy your requirements and install them
COPY ./backend/requirements.txt /code/requirements.txt
RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt

# Copy your entire backend code
COPY ./backend /code

# Hugging Face Spaces strictly requires servers to run on port 7860
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]