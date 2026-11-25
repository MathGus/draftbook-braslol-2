# Draftbook · Guia de draft do BRASLOL 2

O Draftbook ajuda a consultar um campeão depois do pick e a decidir a próxima escolha no BRASLOL 2. O guia é gratuito e abre no navegador. [Abrir o Draftbook](https://mathgus.github.io/draftbook-braslol-2/)

## Durante o draft

| O que você quer fazer | Como usar |
| --- | --- |
| Consultar um campeão | Busque o nome e escolha a rota para ver os confrontos favoráveis e difíceis, as sinergias e a força no início, meio e fim da partida. [Guia de campeões](https://mathgus.github.io/draftbook-braslol-2/) |
| Planejar picks e bans | Preencha as duas escalações para comparar o saldo e ver até três sugestões de pick ou ban. Arraste um pick para outra rota do mesmo time para simular uma troca. No celular, abra o pick e toque em **Mover de rota**. [Simulador](https://mathgus.github.io/draftbook-braslol-2/simulador.html) |
| Consultar o meta de uma carreira | Importe o save JSON exportado pelo jogo. Escolha a data e a rota, depois clique em **Usar no simulador** para aplicar os tiers ao draft. [Meta da carreira](https://mathgus.github.io/draftbook-braslol-2/meta.html) |

A seed do save determina os tiers base por temporada, etapa e rota. A data sugere a etapa pelo calendário do jogo. Se a competição da sua carreira mudou em outro dia, escolha a etapa manualmente. A consulta do dia salvo também mostra os bônus do técnico e as estatísticas já registradas.

O guia lê o JSON no seu navegador. Guarda localmente as informações de meta necessárias à consulta e as escolhas do simulador. Em **Meta da carreira**, use **Limpar** para remover o meta importado. No simulador, **Limpar picks e bans** zera as escalações e os banimentos. O arquivo de save original permanece no seu dispositivo.

## Executar localmente

Os arquivos do site estão prontos em `dist/`. Para abrir uma cópia local com Python 3, execute o comando abaixo na raiz do repositório.

```sh
python -m http.server 8000 --bind 127.0.0.1 --directory dist
```

Abra [o guia local](http://127.0.0.1:8000/). O fluxo do GitHub Actions publica o conteúdo de `dist/` no GitHub Pages. [Configuração da publicação](.github/workflows/pages.yml)

## Formatação do código

Execute o comando abaixo na raiz do repositório para formatar o JavaScript, o HTML e o CSS.

```sh
npx prettier@3.6.2 --write "dist/**/*.{js,html,css}" "scripts/*.mjs"
```

Os scripts de atualização já gravam as tabelas de campeões com dois espaços de indentação.

## Publicidade

O guia, o meta e o simulador têm um espaço para um anúncio de display manual. Ele fica na margem direita em telas largas e antes do rodapé nas demais. Com os identificadores em branco, o guia mantém o espaço oculto e dispensa o carregamento do AdSense.

Para ativar, verifique o domínio no AdSense e aguarde o status **Pronto**. Configure a divulgação de privacidade e as mensagens de consentimento aplicáveis à veiculação. Mantenha **Anúncios automáticos** desativados e crie um bloco de **Display** responsivo. Copie os valores públicos de `data-ad-client` e `data-ad-slot` do bloco para `publisherId` e `slotId` em [publicidade.js](dist/publicidade.js). [Cadastro e verificação do site](https://support.google.com/adsense/answer/12169212?hl=pt-BR) · [Privacidade e mensagens](https://support.google.com/adsense/answer/13554116?hl=pt-BR)

## Dados e créditos

- As fichas de confronto, sinergias, perfis e regras de meta vêm do BRASLOL 2. [Jogo](https://braslol2.pages.dev/) · [Importação das tabelas](scripts/atualizar-dados.mjs)
- Os retratos, ilustrações e metadados de League of Legends vêm do Data Dragon da Riot Games. O Draftbook é um projeto independente de fãs. [Data Dragon](https://developer.riotgames.com/docs/lol#data-dragon) · [Política da Riot para projetos de fãs](https://www.riotgames.com/pt-br/juridico)
- As fontes Barlow Condensed e DM Sans usam a SIL Open Font License 1.1. [Licença da Barlow Condensed](dist/assets/fonts/barlowcondensed-OFL.txt) · [Licença da DM Sans](dist/assets/fonts/dmsans-OFL.txt)

## Licença

Qualquer pessoa pode usar gratuitamente a versão original e compartilhar o link do guia. A edição das partes de autoria de MathGus exige sua autorização prévia e expressa por escrito. [Licença do Draftbook](LICENSE.md)
