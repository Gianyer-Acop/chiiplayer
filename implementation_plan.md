# Plano de Implementação: Fase 3 (Refinamentos Avançados e Features)

Com base no seu novo feedback, montei o plano para essa terceira e última iteração da interface e lógicas.

## 1. Vinil e BPM
- **Problema:** A arte está pequena, o disco não gira e o BPM não aparece direito.
- **Causa/Solução:** O pacote `anime.js` às vezes tem conflitos de estado ao pausar/despausar animações circulares dinâmicas. Vou **remover o anime.js para o vinil** e usar **Animação CSS Nativa**. Isso garante que o disco gire com perfeição.
- **Arte do Álbum:** Vou aumentar o rótulo central (arte) de `76px` para `110px`, deixando mais visível.
- **BPM:** O texto do BPM será reposicionado para garantir que fique sempre legível.

## 2. Balão de Pensamento do Pet
- **Problema:** Ovalado, não parece uma nuvem de pensamento, e textos longos não cabem.
- **Solução (Estética):** Vou reescrever o CSS do balão adicionando múltiplas "bolhas" ao redor do contêiner principal (`box-shadow` e pseudo-elementos) para criar um formato real de **nuvem fofa**.
- **Solução (Texto Longo):** Implementarei um efeito **Marquee (Letreiro Digital)** no CSS. Se o nome da música for muito longo, o texto ficará rolando suavemente da direita para a esquerda dentro do balão, em loop (transição contínua).

## 3. Playlists: Tocar e Adicionar (API)
- **Problema de Salvar/Adicionar:** A API do Spotify pode rejeitar parâmetros na URL para métodos `PUT/POST` em algumas integrações. Vou alterar o código para enviar os IDs das músicas no **corpo (Body JSON)** da requisição, o que é mais estável.
- **Novo Recurso (Tocar Playlist):** Adicionarei um botão de "Play" (▶) ao lado de cada playlist na barra lateral. Ao clicar, chamarei um novo método na API (`playContext`) passando a `uri` da playlist, fazendo o Spotify tocar aquela playlist inteira a partir da primeira música!

## 4. Fila Clicável (Queue)
- **Problema:** Ao clicar na música da fila, ela toca, mas limpa a fila.
- **Causa:** Infelizmente, essa é uma limitação oficial e estrita da API do Spotify. Não existe um comando "pular para a posição X da fila". Quando enviamos o comando para tocar uma `uri` específica, o Spotify cria um *novo contexto* (apenas com aquela música).
- **Workaround (Alternativa):** Em vez de tocar a música na fila e perder a fila toda, vou alterar a ação de clique na lista da Fila. Ao clicar na música que já está na fila, não vamos tocá-la, e sim **exibir um Toast** avisando que a música já está agendada para tocar em breve. O recurso de tocar direto será focado nas **Playlists**.

---

## 🛠 Arquivos a serem modificados

1. **`player_renderer.js` e `pet_renderer.js`:**
   - Remoção do código do `anime.js`.
   - Adição da manipulação da animação CSS nativa para o disco.
   - Adição do evento de "Tocar Playlist" na renderização da Sidebar.
2. **`styles.css` e `pet_styles.css`:**
   - Aumento da arte central do vinil e adição do `@keyframes spin`.
   - Remodelagem completa do `.pet-bubble` para formato de nuvem.
   - Adição de animação `@keyframes marquee` para o texto do balão.
3. **`spotifyApi.js`:**
   - Adição da função `playContext(uri)` para iniciar playlists.
   - Modificação de `saveTrack`, `removeTrack` e `addTrackToPlaylist` para usar payload via JSON Body.

---

> [!IMPORTANT]  
> Você concorda com as soluções, principalmente a substituição do `anime.js` por CSS puro e a limitação oficial do Spotify em relação a pular itens na fila? Posso iniciar o código da Fase 3?
