"""Prepara as artes locais do guia com Python 3 e Pillow."""

from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path
import json
import re
import time
from urllib.error import URLError
from urllib.request import Request, urlopen

from PIL import Image, ImageOps

GAME = "https://braslol2.pages.dev/js/data/"
CDN = "https://ddragon.leagueoflegends.com/cdn/"
ASSETS = Path(__file__).resolve().parents[1] / "dist" / "assets"


def read_url(url):
    for attempt in range(3):
        try:
            request = Request(url, headers={"User-Agent": "BRASLOL2 draft guide"})
            with urlopen(request, timeout=25) as response:
                return response.read()
        except (TimeoutError, URLError):
            if attempt == 2:
                raise
            time.sleep(2**attempt)


def make_image(url, path, size, quality):
    with Image.open(BytesIO(read_url(url))) as original:
        image = ImageOps.fit(original.convert("RGB"), size, Image.Resampling.LANCZOS)
        destination = path.with_suffix(".tmp")
        image.save(destination, "WEBP", quality=quality, method=4)
        destination.replace(path)


def main():
    roster = read_url(GAME + "champions.js").decode()
    image_definitions = read_url(GAME + "images.js").decode()
    champions = re.findall(r'\bid:"([a-zA-Z0-9]+)",name:', roster)
    version = re.search(r'ddragonVersion:"([\d.]+)"', image_definitions)
    if not champions or len(set(champions)) != len(champions) or not version:
        raise ValueError("Confira o formato das fontes do BRASLOL 2 antes de atualizar.")

    icons = ASSETS / "champions"
    splashes = ASSETS / "splash"
    for directory in [icons, splashes]:
        directory.mkdir(parents=True, exist_ok=True)
    official = json.loads(read_url(f"{CDN}{version[1]}/data/pt_BR/champion.json"))["data"]
    metadata = {
        champion: {key: official[champion][key] for key in ("title", "tags")}
        for champion in champions
    }
    (ASSETS / "champion-metadata.js").write_text(
        "window.CHAMPION_META = "
        + json.dumps(metadata, ensure_ascii=False, indent=2)
        + ";\n",
        encoding="utf-8",
    )
    jobs = []
    for champion in champions:
        # O Data Dragon distingue a capitalização do ícone e da ilustração.
        art_name = "FiddleSticks" if champion == "Fiddlesticks" else champion
        jobs.append(
            (
                f"{CDN}{version[1]}/img/champion/{champion}.png",
                icons / f"{champion}.webp",
                (108, 108),
                85,
            )
        )
        jobs.append(
            (
                f"{CDN}img/champion/splash/{art_name}_0.jpg",
                splashes / f"{champion}.webp",
                (768, 452),
                72,
            )
        )

    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = [pool.submit(make_image, *job) for job in jobs]
        for future in futures:
            future.result()
    print(
        f"{len(champions)} campeões, "
        f"{sum(job[1].stat().st_size for job in jobs):,} bytes de arte."
    )


if __name__ == "__main__":
    main()
