const express = require('express'),
    app = express(),
    bodyParser = require('body-parser'),
    fs = require('fs'),
    formidable = require('formidable'),
    SparkMD5 = require('spark-md5'),
    PORT = 8888;

app.listen(PORT, () => {
    console.log(`THE WEB SERVICE IS CREATED SUCCESSFULLY AND IS LISTENING TO THE PORT：${PORT}`);
});

app.use(bodyParser.urlencoded({
    extended: false,
    limit: '1024mb'
}));

const uploadDir = `${__dirname}/upload`;

function handleFormidable(req, res, temp) {
    return new Promise((resolve, reject) => {
        let options = {
            maxFileSize: 200 * 1024 * 1024, // 最大文件大小
            uploadDir: temp ? undefined : uploadDir, // 上传文件的目录
            keepExtensions: true, // 保留文件扩展名
            multiples: true // 支持多文件上传
        };

        const form = new formidable.IncomingForm(options);

        form.parse(req, (err, fields, files) => {
            if (err) {
                console.error('Form parse error:', err);
                res.status(500).send({
                    code: 1,
                    reason: 'Form parse error: ' + err.message
                });
                reject(err);
                return;
            }
            console.log('Fields:', fields);
            console.log('Files:', files);
            if (Object.keys(files).length === 0 && Object.keys(fields).length === 0) {
                res.status(400).send({
                    code: 1,
                    reason: 'No files or fields received'
                });
                reject(new Error('No files or fields received'));
                return;
            }
            resolve({
                fields,
                files
            });
        });
    });
}

// 基于FORM-DATA上传数据
app.post('/single1', async (req, res) => {
    let { files } = await handleFormidable(req, res);
    if (!files || !files.file) {
        res.status(400).send({
            code: 1,
            reason: 'No file uploaded'
        });
        return;
    }
    let file = files.file[0];
    res.send({
        code: 0,
        originalFilename: file.originalFilename,
        path: file.path.replace(__dirname, `http://127.0.0.1:${PORT}`)
    });
});

// 切片上传 && 合并
app.post('/single3', async (req, res) => {
    let { fields, files } = await handleFormidable(req, res, true);
    if (!files || !files.chunk || !fields || !fields.filename) {
        res.status(400).send({
            code: 1,
            reason: 'Invalid file or fields'
        });
        return;
    }
    console.log('Chunk file:', files.chunk[0]);
    let chunk = files.chunk[0]; // formidable 中的文件解析
    let filename = fields.filename[0];
    let hash = /([0-9a-zA-Z]+)_\d+/.exec(filename)[1];
    let path = `${uploadDir}/${hash}`;

    if (!fs.existsSync(path)) {
        fs.mkdirSync(path);
    }
    path = `${path}/${filename}`;

    fs.access(path, async err => {
        if (!err) {
            res.send({
                code: 0,
                path: path.replace(__dirname, `http://127.0.0.1:${PORT}`)
            });
            return;
        }

        await new Promise(resolve => {
            setTimeout(_ => {
                resolve();
            }, 200);
        });

        let readStream = fs.createReadStream(chunk.filepath || chunk.path);
        let writeStream = fs.createWriteStream(path);
        readStream.pipe(writeStream);
        readStream.on('end', function() {
            fs.unlinkSync(chunk.filepath || chunk.path);
            res.send({
                code: 0,
                path: path.replace(__dirname, `http://127.0.0.1:${PORT}`)
            });
        });
    });
});

app.get('/merge', (req, res) => {
    let { hash } = req.query;
    let path = `${uploadDir}/${hash}`;
    let fileList = fs.readdirSync(path);
    let suffix;

    fileList.sort((a, b) => {
        let reg = /_(\d+)/;
        return reg.exec(a)[1] - reg.exec(b)[1];
    }).forEach(item => {
        if (!suffix) suffix = /\.([0-9a-zA-Z]+)$/.exec(item)[1];
        fs.appendFileSync(`${uploadDir}/${hash}.${suffix}`, fs.readFileSync(`${path}/${item}`));
        fs.unlinkSync(`${path}/${item}`);
    });
    fs.rmdirSync(path);
    res.send({
        code: 0,
        path: `http://127.0.0.1:${PORT}/upload/${hash}.${suffix}`
    });
});

app.use(express.static('./'));
app.use((req, res) => {
    res.status(404).send('NOT FOUND!');
});
