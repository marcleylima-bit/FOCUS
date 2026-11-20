# SMTP dedicado do FOCUS (Resend + Supabase Auth)

Este pacote prepara o FOCUS para usar um provedor SMTP próprio para e-mails de cadastro, confirmação e recuperação de senha. A integração é feita no **Supabase Auth**, e não no navegador: assim, a senha SMTP nunca é enviada ao GitHub nem exposta aos usuários.

## O que você precisa criar

1. Uma conta no Resend: https://resend.com/
2. Um domínio que você controla (recomendado, por exemplo `seudominio.com.br`).
3. Um remetente no domínio, por exemplo `conta@seudominio.com.br`.
4. Um projeto Supabase do FOCUS.

> O Resend é o serviço SMTP externo. O Supabase continua responsável por autenticar as contas. Não é necessário criar uma segunda aplicação Supabase apenas para o SMTP.

## 1. Verificar o domínio no Resend

1. Entre no painel do Resend e abra **Domains**.
2. Adicione o domínio que você controla.
3. Copie os registros DNS apresentados pelo Resend (SPF, DKIM e, quando indicado, DMARC) para o painel do seu registrador/DNS.
4. Aguarde a validação e confirme que o domínio aparece como verificado no Resend.
5. Crie/autorize o remetente que será exibido nos e-mails, por exemplo `FOCUS <conta@seudominio.com.br>`.

Não use um endereço de terceiros ou um domínio que você não controla. Os registros DNS exatos são fornecidos pelo Resend para o seu domínio; não copie registros de exemplos.

## 2. Obter os dados SMTP

No painel do Resend, gere uma API Key com permissão adequada para envio. O Resend utiliza estes dados SMTP:

| Campo | Valor |
|---|---|
| Host | `smtp.resend.com` |
| Porta | `465` (SSL) ou `587` (STARTTLS) |
| Usuário | `resend` |
| Senha | Sua API Key do Resend |
| Remetente | Um endereço do domínio verificado |

Nunca coloque a API Key em `js/config.js`, `index.html`, arquivos JavaScript do navegador ou repositórios públicos.

## 3. Ligar o SMTP no Supabase

No painel do projeto Supabase:

1. Abra **Authentication**.
2. Entre em **SMTP Settings** (a localização/rotulagem pode variar conforme a versão do painel).
3. Ative **Enable Custom SMTP**.
4. Preencha host, porta, usuário, senha e remetente com os dados acima.
5. Salve e use a opção de teste, se disponível.
6. Em **Authentication > URL Configuration**, configure a URL pública do FOCUS e as URLs locais de desenvolvimento permitidas.
7. Revise os modelos em **Authentication > Email Templates** para usar o nome FOCUS e o remetente verificado. Modelos prontos em `smtp/templates/confirm-signup.html` e `smtp/templates/reset-password.html`; copie o HTML correspondente para os modelos de confirmação e recuperação. Mantenha a variável `{{ .ConfirmationURL }}` no link.

Para produção, prefira a porta 465 com SSL se ela estiver disponível no painel. Se o painel solicitar STARTTLS, use a porta 587.

## 4. Testar o fluxo

1. Use um endereço de e-mail seu, que você possa acessar.
2. Crie uma conta de teste no FOCUS.
3. Confira a chegada da confirmação na caixa de entrada e no spam.
4. Teste também recuperação de senha no fluxo do Supabase, quando habilitado.
5. Consulte os logs de envio no Resend e os logs de Auth no Supabase caso não chegue.

O SMTP personalizado substitui o serviço de e-mail padrão do Supabase para Auth, mas **não significa envio ilimitado**. O Resend aplica limites e políticas próprios, e domínios não verificados podem ter restrições. Confira o plano e os limites atuais no painel do provedor.

## 5. Segurança e operação comercial

- Mantenha a API Key somente no painel seguro do provedor/Supabase.
- Não compartilhe a chave em prints, mensagens ou commits.
- Configure SPF/DKIM e uma política DMARC para melhorar autenticação e entregabilidade.
- Use remetente do domínio verificado.
- Faça testes de cadastro, confirmação e redefinição antes de liberar novos clientes.
- Para comercializar o FOCUS em múltiplas instituições, avalie um projeto Supabase e um domínio/remetente por ambiente/cliente, ou uma arquitetura multi-tenant com isolamento validado. Não compartilhe credenciais administrativas entre clientes.

## Modelo local de configuração

O arquivo `.env.example` nesta pasta é apenas uma referência para organização interna. O Supabase Auth não lê essas variáveis automaticamente a partir do frontend ou do GitHub Pages; os dados devem ser cadastrados no painel seguro do Supabase.
