const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../web/src/pages/AuthScreen.jsx');
let code = fs.readFileSync(file, 'utf8');

// 1. Add setVerifyToken
code = code.replace("const [resetToken, setResetToken] = useState('');", "const [resetToken, setResetToken] = useState('');\n  const [verifyToken, setVerifyToken] = useState('');");

// 2. useEffect handling ?verify=
const effFind = `if (t) { setResetToken(t); setMode('reset'); }`;
const effReplace = `if (t) { setResetToken(t); setMode('reset'); }\n    const v = p.get('verify');\n    if (v) { setVerifyToken(v); setMode('verify'); }`;
code = code.replace(effFind, effReplace);

// 3. limparUrl handling ?verify
const cleanFind = `u.searchParams.delete('reset'); u.searchParams.delete('erro');`;
const cleanReplace = `u.searchParams.delete('reset'); u.searchParams.delete('erro'); u.searchParams.delete('verify');`;
code = code.replace(cleanFind, cleanReplace);

// 4. submit signup handling pendingVerification
const signupFind = `        await auth.signup(payload);
        onAuthed();`;
const signupReplace = `        const res = await auth.signup(payload);
        if (res.pendingVerification) {
          setMode('login');
          setInfo('Falta pouco! Enviamos um link de confirmação para o seu e-mail.');
        } else {
          onAuthed();
        }`;
code = code.replace(signupFind, signupReplace);

// 5. submit handling verify
const forgotFind = `} else if (mode === 'forgot') {`;
const verifyAdd = `} else if (mode === 'verify') {
        await auth.verify(verifyToken);
        limparUrl();
        onAuthed();
      `;
code = code.replace(forgotFind, verifyAdd + forgotFind);

// 6. Titulo
const titFind = `const titulo = mode === 'login' ? 'Entrar na sua conta'
    : mode === 'signup' ? 'Criar sua conta'
    : mode === 'forgot' ? 'Recuperar acesso'
    : 'Criar uma nova senha';`;
const titReplace = `const titulo = mode === 'login' ? 'Entrar na sua conta'
    : mode === 'signup' ? 'Criar sua conta'
    : mode === 'forgot' ? 'Recuperar acesso'
    : mode === 'verify' ? 'Confirmar e-mail'
    : 'Criar uma nova senha';`;
code = code.replace(titFind, titReplace);

// 7. Subtitulo
const subFind = `const subtitulo = mode === 'forgot' ? 'Enviamos um link para o seu e-mail.'
    : mode === 'reset' ? 'Escolha a senha que você vai usar a partir de agora.'
    : 'Gerencie a rede de telas de qualquer lugar.';`;
const subReplace = `const subtitulo = mode === 'forgot' ? 'Enviamos um link para o seu e-mail.'
    : mode === 'reset' ? 'Escolha a senha que você vai usar a partir de agora.'
    : mode === 'verify' ? 'Verificando seu cadastro...'
    : 'Gerencie a rede de telas de qualquer lugar.';`;
code = code.replace(subFind, subReplace);

// 8. Button text
const btnFind = `? mode === 'forgot' ? 'Enviar link' : 'Salvar nova senha'}`;
const btnReplace = `? mode === 'forgot' ? 'Enviar link' : mode === 'verify' ? 'Confirmar' : 'Salvar nova senha'}`;
code = code.replace(btnFind, btnReplace);

// 9. Hide form inputs on verify
const fieldFind = `{mode !== 'reset' && (
              <Field label="E-mail">`;
const fieldReplace = `{mode !== 'reset' && mode !== 'verify' && (
              <Field label="E-mail">`;
code = code.replace(fieldFind, fieldReplace);

const passFind = `{mode !== 'forgot' && (
              <Field label={mode === 'reset' ? 'Nova senha' : 'Senha'} hint={mode === 'signup' || mode === 'reset' ? 'Mínimo de 6 caracteres.' : undefined}>`;
const passReplace = `{mode !== 'forgot' && mode !== 'verify' && (
              <Field label={mode === 'reset' ? 'Nova senha' : 'Senha'} hint={mode === 'signup' || mode === 'reset' ? 'Mínimo de 6 caracteres.' : undefined}>`;
code = code.replace(passFind, passReplace);

const backFind = `{(mode === 'forgot' || mode === 'reset') && (`;
const backReplace = `{(mode === 'forgot' || mode === 'reset' || mode === 'verify') && (`;
code = code.replace(backFind, backReplace);

fs.writeFileSync(file, code);
console.log('AuthScreen.jsx updated');
