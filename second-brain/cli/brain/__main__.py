"""
Second Brain CLI

Command-line interface for interacting with your Second Brain.
"""

import os
import sys
from typing import Optional, List

import click
import httpx
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.markdown import Markdown
from dotenv import load_dotenv


# Load environment variables
load_dotenv()

# Configuration
API_BASE_URL = os.getenv("SECOND_BRAIN_API_URL", "http://localhost:8000")
API_TOKEN = os.getenv("SECOND_BRAIN_API_TOKEN", "")

console = Console()


def get_client() -> httpx.Client:
    """Create an HTTP client with authentication."""
    headers = {}
    if API_TOKEN:
        headers["Authorization"] = f"Bearer {API_TOKEN}"
    return httpx.Client(base_url=API_BASE_URL, headers=headers, timeout=30.0)


def handle_api_error(response: httpx.Response) -> None:
    """Handle API error responses."""
    if response.status_code == 401:
        console.print("[red]Error:[/red] Not authenticated. Set SECOND_BRAIN_API_TOKEN.")
        sys.exit(1)
    elif response.status_code == 404:
        console.print("[red]Error:[/red] Resource not found.")
        sys.exit(1)
    elif response.status_code >= 400:
        try:
            error = response.json()
            console.print(f"[red]Error:[/red] {error.get('detail', 'Unknown error')}")
        except Exception:
            console.print(f"[red]Error:[/red] HTTP {response.status_code}")
        sys.exit(1)


@click.group()
@click.version_option(version="0.1.0")
def cli():
    """
    Second Brain - AI-Powered Knowledge Retention System

    Capture, search, and connect your knowledge.
    """
    pass


@cli.command()
@click.argument("content", nargs=-1, required=True)
@click.option("--source", "-s", help="Source of the knowledge (e.g., 'claude-code', 'web')")
@click.option("--tag", "-t", multiple=True, help="Tags for categorization")
@click.option("--project", "-p", help="Project context")
def add(content: tuple, source: Optional[str], tag: tuple, project: Optional[str]):
    """
    Capture new knowledge to your Second Brain.

    Examples:

        brain add "CORS blocks browser cross-origin requests"

        brain add "Backend proxy pattern bypasses CORS" --tag debugging --tag web

        brain add "ResNet34 achieved 94% accuracy" --project garbage-classification
    """
    content_str = " ".join(content)

    payload = {
        "content": content_str,
        "source": source,
        "tags": list(tag) if tag else [],
        "context": {"project": project} if project else {},
    }

    with get_client() as client:
        response = client.post("/api/v1/notes", json=payload)
        handle_api_error(response)

        result = response.json()

        console.print(Panel(
            f"[green]✓ Captured![/green]\n\n"
            f"[dim]Note ID:[/dim] {result['note_id'][:8]}...\n"
            f"[dim]Tags:[/dim] {', '.join(result['tags']) or 'none'}\n"
            f"[dim]Entities:[/dim] {', '.join(result['entities']) or 'none'}\n"
            f"[dim]Connections:[/dim] {len(result['connections'])} related notes",
            title="Knowledge Captured",
            border_style="green"
        ))

        if result["connections"]:
            console.print("\n[bold]Connected to:[/bold]")
            for conn in result["connections"][:3]:
                console.print(f"  • {conn['preview'][:60]}... [dim]({conn['strength']:.0%})[/dim]")


@cli.command()
@click.argument("query", nargs=-1, required=True)
@click.option("--tag", "-t", multiple=True, help="Filter by tags")
@click.option("--limit", "-n", default=5, help="Number of results")
def search(query: tuple, tag: tuple, limit: int):
    """
    Search your knowledge base.

    Supports natural language queries with fuzzy matching.

    Examples:

        brain search "that API error from last month"

        brain search "machine learning optimization" --tag python

        brain search "debugging" --limit 10
    """
    query_str = " ".join(query)

    payload = {
        "query": query_str,
        "filters": {"tags": list(tag)} if tag else None,
        "top_k": limit,
    }

    with get_client() as client:
        response = client.post("/api/v1/search", json=payload)
        handle_api_error(response)

        result = response.json()

        if not result["results"]:
            console.print("[yellow]No results found.[/yellow]")
            return

        console.print(f"\n[bold]Found {result['total_results']} results for:[/bold] {query_str}\n")

        for i, item in enumerate(result["results"], 1):
            score_color = "green" if item["score"] > 0.8 else "yellow" if item["score"] > 0.6 else "dim"
            console.print(Panel(
                f"{item['preview']}\n\n"
                f"[dim]Tags:[/dim] {', '.join(item['tags']) or 'none'} | "
                f"[dim]Source:[/dim] {item['source'] or 'unknown'} | "
                f"[dim]Created:[/dim] {item['created_at'][:10]}",
                title=f"[{score_color}]{i}. Match: {item['score']:.0%}[/{score_color}]",
                border_style=score_color
            ))


@cli.command()
@click.option("--conversation", "-c", help="Continue a conversation by ID")
def chat(conversation: Optional[str]):
    """
    Chat with your knowledge base.

    Interactive mode with RAG and function calling.

    Examples:

        brain chat

        brain chat --conversation abc123
    """
    console.print(Panel(
        "Chat with your Second Brain\n"
        "Type your questions, or 'quit' to exit.\n"
        "The AI will search your knowledge to answer.",
        title="Second Brain Chat",
        border_style="blue"
    ))

    conversation_id = conversation

    with get_client() as client:
        while True:
            try:
                user_input = console.input("\n[bold blue]You:[/bold blue] ")

                if user_input.lower() in ["quit", "exit", "q"]:
                    console.print("[dim]Goodbye![/dim]")
                    break

                if not user_input.strip():
                    continue

                payload = {
                    "message": user_input,
                    "conversation_id": conversation_id,
                }

                with console.status("[bold blue]Thinking...[/bold blue]"):
                    response = client.post("/api/v1/chat", json=payload)
                    handle_api_error(response)

                result = response.json()
                conversation_id = result["conversation_id"]

                console.print(f"\n[bold green]Brain:[/bold green]")
                console.print(Markdown(result["response"]))

                if result["sources_used"]:
                    console.print("\n[dim]Sources used:[/dim]")
                    for source in result["sources_used"][:3]:
                        console.print(f"  • {source['content'][:50]}...")

            except KeyboardInterrupt:
                console.print("\n[dim]Goodbye![/dim]")
                break


@cli.command()
@click.option("--limit", "-n", default=5, help="Number of reviews")
def review(limit: int):
    """
    Start a spaced repetition review session.

    Reviews notes that are due based on the SM-2 algorithm.

    Example:

        brain review

        brain review --limit 10
    """
    with get_client() as client:
        response = client.get(f"/api/v1/reviews/due?limit={limit}")
        handle_api_error(response)

        result = response.json()

        if result["due_count"] == 0:
            console.print("[green]No reviews due! You're all caught up.[/green]")
            return

        console.print(Panel(
            f"You have [bold]{result['due_count']}[/bold] notes to review.\n"
            "Rate each on a scale of 0-5:\n"
            "  0 = Complete blackout\n"
            "  3 = Correct with difficulty\n"
            "  5 = Perfect recall\n",
            title="Spaced Repetition Review",
            border_style="blue"
        ))

        for i, item in enumerate(result["reviews"], 1):
            console.print(f"\n[bold]Review {i}/{len(result['reviews'])}[/bold]")
            console.print(Panel(
                item["content_preview"],
                title="What do you remember about this?",
                border_style="yellow"
            ))

            while True:
                try:
                    rating = int(console.input("[bold]Your rating (0-5):[/bold] "))
                    if 0 <= rating <= 5:
                        break
                    console.print("[red]Please enter 0-5[/red]")
                except ValueError:
                    console.print("[red]Please enter a number[/red]")

            # Submit review
            review_response = client.post(
                f"/api/v1/reviews/{item['note_id']}",
                json={"rating": rating}
            )
            handle_api_error(review_response)

            review_result = review_response.json()
            console.print(
                f"[green]✓[/green] Next review in "
                f"[bold]{review_result['interval_days']}[/bold] days"
            )

        console.print("\n[green]Review session complete![/green]")


@cli.command()
def stats():
    """
    Show your knowledge statistics.

    Displays:
    - Total notes
    - Reviews completed
    - Current streak
    """
    with get_client() as client:
        # Get review stats
        response = client.get("/api/v1/reviews/stats")
        handle_api_error(response)

        result = response.json()

        table = Table(title="Second Brain Statistics")
        table.add_column("Metric", style="cyan")
        table.add_column("Value", style="green")

        table.add_row("Total Reviews", str(result["total_reviews"]))
        table.add_row("Due Today", str(result["due_today"]))
        table.add_row("Current Streak", f"{result['current_streak']} days")
        table.add_row("Avg Ease Factor", str(result["average_ease_factor"]))

        console.print(table)


@cli.command()
def health():
    """Check the health of the Second Brain API."""
    try:
        with get_client() as client:
            response = client.get("/health")
            result = response.json()

            status_color = "green" if result["status"] == "healthy" else "yellow"

            table = Table(title="System Health")
            table.add_column("Service", style="cyan")
            table.add_column("Status", style=status_color)

            table.add_row("Overall", result["status"])
            table.add_row("PostgreSQL", result["postgres"])
            table.add_row("Qdrant", result["qdrant"])
            table.add_row("Redis", result["redis"])

            console.print(table)

    except httpx.ConnectError:
        console.print("[red]Error:[/red] Cannot connect to API at", API_BASE_URL)
        console.print("Make sure the server is running.")
        sys.exit(1)


# ============================================================================
# PKM (Personal Knowledge Model) Commands
# ============================================================================

@cli.group()
def pkm():
    """
    Personal Knowledge Model commands.

    Train your own AI model on YOUR accumulated knowledge.

    Workflow:
        1. brain pkm export    - Export knowledge as training data
        2. brain pkm prepare   - Prepare data for training
        3. brain pkm train     - Train your PKM
        4. brain pkm serve     - Serve your trained model
    """
    pass


@pkm.command()
@click.option("--format", "-f",
              type=click.Choice(["conversation", "completion", "raw_text", "sft"]),
              default="conversation",
              help="Export format (default: conversation)")
@click.option("--output", "-o", default="exports", help="Output directory")
@click.option("--no-synthetic", is_flag=True, help="Skip synthetic Q&A generation")
@click.option("--no-connections", is_flag=True, help="Skip connection-based training data")
def export(format: str, output: str, no_synthetic: bool, no_connections: bool):
    """
    Export your knowledge as training data.

    Converts your notes into training-ready format for PKM training.

    Examples:

        brain pkm export

        brain pkm export --format sft --output data/my_knowledge/

        brain pkm export --no-synthetic
    """
    format_map = {
        "conversation": "conversation",
        "completion": "completion",
        "raw_text": "raw_text",
        "sft": "nanochat_sft",
    }

    payload = {
        "format": format_map.get(format, format),
        "include_synthetic": not no_synthetic,
        "include_connections": not no_connections,
    }

    with get_client() as client:
        with console.status("[bold blue]Exporting knowledge...[/bold blue]"):
            response = client.post("/api/v1/export/training-data", json=payload)
            handle_api_error(response)

        result = response.json()

        console.print(Panel(
            f"[green]✓ Export Complete![/green]\n\n"
            f"[dim]Format:[/dim] {result['format']}\n"
            f"[dim]Total examples:[/dim] {result['total_examples']}\n"
            f"[dim]Notes processed:[/dim] {result['notes_processed']}\n"
            f"[dim]Estimated tokens:[/dim] {result['stats'].get('estimated_tokens', 'N/A')}\n"
            f"[dim]Output file:[/dim] {result['filepath']}",
            title="Knowledge Exported for PKM Training",
            border_style="green"
        ))

        console.print("\n[bold]Next step:[/bold]")
        console.print(f"  brain pkm prepare --input {result['filepath']}")


@pkm.command()
@click.option("--input", "-i", required=True, help="Path to exported JSONL file")
@click.option("--output", "-o", default="data/my_knowledge", help="Output directory")
@click.option("--mode", type=click.Choice(["base", "sft"]), default="base",
              help="Preparation mode: base (pretraining) or sft (instruction tuning)")
@click.option("--val-split", default=0.1, type=float, help="Validation split ratio")
def prepare(input: str, output: str, mode: str, val_split: float):
    """
    Prepare exported knowledge for training.

    Tokenizes and formats data for efficient training.

    Examples:

        brain pkm prepare --input exports/knowledge.jsonl

        brain pkm prepare --input exports/knowledge.jsonl --mode sft

        brain pkm prepare --input exports/knowledge.jsonl --output data/custom/
    """
    import subprocess
    from pathlib import Path

    # Find the training directory
    training_dir = Path(__file__).parent.parent.parent / "training"
    prepare_script = training_dir / "prepare_data.py"

    if not prepare_script.exists():
        console.print(f"[red]Error:[/red] Training scripts not found at {training_dir}")
        console.print("Make sure the training module is installed.")
        sys.exit(1)

    cmd = [
        sys.executable, str(prepare_script),
        "--input", input,
        "--output", output,
        "--mode", mode,
        "--val-split", str(val_split),
    ]

    console.print(Panel(
        f"[blue]Preparing knowledge for PKM training...[/blue]\n\n"
        f"Input: {input}\n"
        f"Output: {output}\n"
        f"Mode: {mode}",
        title="PKM Data Preparation",
        border_style="blue"
    ))

    result = subprocess.run(cmd, capture_output=False)

    if result.returncode == 0:
        console.print("\n[bold]Next step:[/bold]")
        console.print(f"  brain pkm train --data {output}")
    else:
        console.print("[red]Data preparation failed. Check the error above.[/red]")
        sys.exit(1)


@pkm.command()
@click.option("--data", "-d", default="data/my_knowledge", help="Path to prepared data")
@click.option("--config", "-c",
              type=click.Choice(["small", "medium", "large"]),
              default="small",
              help="Training config (default: small)")
@click.option("--max-iters", type=int, help="Override max iterations")
@click.option("--resume", "-r", help="Resume from checkpoint")
def train(data: str, config: str, max_iters: Optional[int], resume: Optional[str]):
    """
    Train your Personal Knowledge Model.

    Uses transfer learning from GPT-2 for efficient training.

    Training tiers:
        - small:  124M params, 30min-2hr, 8GB GPU
        - medium: 350M params, 2-6hr, 16GB GPU
        - large:  774M params, 6-24hr, 24GB+ GPU

    Examples:

        brain pkm train --data data/my_knowledge/

        brain pkm train --config medium --max-iters 3000

        brain pkm train --resume checkpoints/pkm_latest.pt
    """
    import subprocess
    from pathlib import Path

    training_dir = Path(__file__).parent.parent.parent / "training"
    train_script = training_dir / "train_pkm.py"
    config_file = training_dir / "config" / f"pkm_{config}.py"

    if not train_script.exists():
        console.print(f"[red]Error:[/red] Training scripts not found at {training_dir}")
        sys.exit(1)

    cmd = [
        sys.executable, str(train_script),
        "--data", data,
        "--config", str(config_file),
    ]

    if max_iters:
        cmd.extend(["--max-iters", str(max_iters)])

    if resume:
        cmd.extend(["--resume", resume])

    console.print(Panel(
        f"[blue]Training your Personal Knowledge Model[/blue]\n\n"
        f"Data: {data}\n"
        f"Config: {config} ({config_file.name})\n"
        f"This may take a while depending on your hardware...",
        title="PKM Training",
        border_style="blue"
    ))

    console.print("\n[dim]Starting training process...[/dim]\n")

    result = subprocess.run(cmd, capture_output=False)

    if result.returncode == 0:
        console.print("\n[bold green]Training complete![/bold green]")
        console.print("\n[bold]Next step:[/bold]")
        console.print("  brain pkm serve --model checkpoints/pkm_best.pt")
    else:
        console.print("[red]Training failed. Check the error above.[/red]")
        sys.exit(1)


@pkm.command()
@click.option("--model", "-m", required=True, help="Path to trained PKM checkpoint")
@click.option("--server", "-s", is_flag=True, help="Run as REST API server")
@click.option("--port", default=8080, type=int, help="Server port (default: 8080)")
@click.option("--hybrid", is_flag=True, help="Enable hybrid mode with cloud fallback")
def serve(model: str, server: bool, port: int, hybrid: bool):
    """
    Serve your trained PKM for inference.

    Modes:
        - CLI (default): Interactive chat in terminal
        - Server: REST API at http://localhost:8080
        - Hybrid: Local PKM + cloud fallback for unknown topics

    Examples:

        brain pkm serve --model checkpoints/pkm_best.pt

        brain pkm serve --model checkpoints/pkm_best.pt --server --port 8080

        brain pkm serve --model checkpoints/pkm_best.pt --hybrid
    """
    import subprocess
    from pathlib import Path

    training_dir = Path(__file__).parent.parent.parent / "training"
    serve_script = training_dir / "serve_pkm.py"

    if not serve_script.exists():
        console.print(f"[red]Error:[/red] Serving script not found at {serve_script}")
        sys.exit(1)

    if not Path(model).exists():
        console.print(f"[red]Error:[/red] Model not found at {model}")
        console.print("Train a model first with: brain pkm train")
        sys.exit(1)

    cmd = [sys.executable, str(serve_script), "--model", model]

    if server:
        cmd.extend(["--server", "--port", str(port)])
        console.print(Panel(
            f"[blue]Starting PKM API Server[/blue]\n\n"
            f"Model: {model}\n"
            f"Endpoint: http://localhost:{port}\n"
            f"API Docs: http://localhost:{port}/docs",
            title="PKM Server",
            border_style="blue"
        ))
    elif hybrid:
        cmd.append("--hybrid")
        console.print(Panel(
            f"[blue]Starting Hybrid PKM[/blue]\n\n"
            f"Local Model: {model}\n"
            f"Cloud Fallback: Enabled\n"
            f"Your PKM handles known topics, cloud handles the rest.",
            title="Hybrid PKM",
            border_style="blue"
        ))
    else:
        console.print(Panel(
            f"[blue]Chat with your Personal Knowledge Model[/blue]\n\n"
            f"Model: {model}\n"
            f"Type 'quit' to exit.",
            title="PKM Chat",
            border_style="blue"
        ))

    subprocess.run(cmd, capture_output=False)


@pkm.command()
def status():
    """
    Show PKM training and model status.

    Displays available checkpoints and training stats.
    """
    from pathlib import Path

    checkpoints_dir = Path("checkpoints")
    exports_dir = Path("exports")
    data_dir = Path("data")

    table = Table(title="PKM Status")
    table.add_column("Component", style="cyan")
    table.add_column("Status", style="green")

    # Check for exports
    if exports_dir.exists():
        exports = list(exports_dir.glob("*.jsonl"))
        table.add_row("Exports", f"{len(exports)} files")
    else:
        table.add_row("Exports", "[dim]None[/dim]")

    # Check for prepared data
    if data_dir.exists():
        has_train = (data_dir / "my_knowledge" / "train.bin").exists()
        table.add_row("Prepared Data", "[green]Ready[/green]" if has_train else "[dim]Not prepared[/dim]")
    else:
        table.add_row("Prepared Data", "[dim]Not prepared[/dim]")

    # Check for checkpoints
    if checkpoints_dir.exists():
        checkpoints = list(checkpoints_dir.glob("*.pt"))
        if checkpoints:
            latest = max(checkpoints, key=lambda p: p.stat().st_mtime)
            table.add_row("Checkpoints", f"{len(checkpoints)} models")
            table.add_row("Latest Model", latest.name)
        else:
            table.add_row("Checkpoints", "[dim]None[/dim]")
    else:
        table.add_row("Checkpoints", "[dim]None[/dim]")

    console.print(table)

    console.print("\n[bold]PKM Workflow:[/bold]")
    console.print("  1. brain pkm export    - Export knowledge")
    console.print("  2. brain pkm prepare   - Prepare for training")
    console.print("  3. brain pkm train     - Train your model")
    console.print("  4. brain pkm serve     - Use your model")


if __name__ == "__main__":
    cli()
