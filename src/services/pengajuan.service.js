import ResponseClass from "../models/response.model.js"
import { Pengajuan } from "../models/pengajuan.model.js"
import { LaporanKeuangan } from "../models/laporan_keuangan.model.js"
import { FotoUmkm } from "../models/foto_umkm.model.js"
import Users from "../models/users.model.js"
import { Op } from "sequelize"
import { Pendanaan } from "../models/pendanaan.model.js"

async function createPengajuan(request){

    const {
        pekerjaan,
        sektor,
        deskripsi,
        penghasilan,
        plafond,
        tenor,
        bagi_hasil,
        jenis_angsuran,
        akad,
        username,
    } = request.body

    var responseError = new ResponseClass.ErrorResponse();
    var responseSuccess = new ResponseClass.SuccessResponse();

    try {

        //menghitung tanggal berakhir (crowdfunding  dilakukan selama 7 hari)
        const tgl_mulai = new Date()
        const tgl_berakhir = new Date(tgl_mulai.getTime() + (7 * 24 * 60 * 60 * 1000))

        const pemilik = await Users.findOne({ 
            where:{username: username},
        })

        //check apakah akun sudah melakukan pengajuan atau belum
        const existingPengajuan = await Pengajuan.findAll({
            where: {
                pemilikId: pemilik.id,
                status: "In Progress"
            }
        })
        if (existingPengajuan) {
            responseError.message = "Anda sudah melakukan pengajuan mohon selesaikan terlebih dahulu"
            return responseError
        }
        
        //menghitung jumlah angsuran
        const jml_angsuran = hitungJmlAngsuran(plafond, tenor, bagi_hasil)

        //post data ke database
        const newPengajuan = await Pengajuan.create({
            pemilikId: pemilik.id,
            pekerjaan,
            sektor,
            deskripsi,
            penghasilan,
            plafond,
            tenor,
            bagi_hasil,
            jenis_angsuran,
            jml_angsuran,
            akad,
            tgl_mulai: tgl_mulai,
            tgl_berakhir: tgl_berakhir
        })

        //cek apakah input file ada
        if (!request.files) {
            responseError.message = "Mohon cantumkan Foto dan laporan keuangan dari UMKM!"
            return responseError
        }

        //ambil url dari cloudinary
        const image1_url = request.files[0].path
        const image2_url = request.files[1].path
        const image3_url = request.files[2].path

        const pengajuanId = newPengajuan.id

        //masukan foto UMKM ke dalam tabel fotoUMKM
        const newFotoUmkm = await FotoUmkm.create({
            pengajuanId,
            image1_url: image1_url,
            image2_url: image2_url,
            image3_url: image3_url,
            image1_filename: request.files[0].filename,
            image2_filename: request.files[1].filename,
            image3_filename: request.files[2].filename,
        })

        //ambil url laporan dan masukan k dalam tabel laporan
        const laporan_url = request.files[3].path
        const newLaporan = await LaporanKeuangan.create({
            laporan_url: laporan_url,
            laporan_filename: request.files[3].filename,
            pengajuanId,
        })

        responseSuccess.message = "Create Pengajuan Successfull!"
        responseSuccess.data = {
            ...newPengajuan['dataValues'],
            foto_umkm: newFotoUmkm,
            laporan_keuangan: newLaporan,
        }
        return responseSuccess

    } catch (error) {
        console.log(error);
        responseError.message = "create Pengajuan to database error";
        return responseError;
    }
}

async function updatePengajuanById(request){
    var responseError = new ResponseClass.ErrorResponse();
    var responseSuccess = new ResponseClass.SuccessResponse();

    const { pengajuanId } = request.params

    const {
        pekerjaan,
        sektor,
        deskripsi,
        penghasilan,
        plafond,
        tenor,
        bagi_hasil,
        jenis_angsuran,
        akad,
        username,
    } = request.body

    try {
        const pemilik = await Users.findOne({
            where: {username: username},
        })
        const existingPengajuan = await Pengajuan.findByPk(pengajuanId)

        const jml_angsuran = hitungJmlAngsuran(plafond, tenor, bagi_hasil)
        const updatedPengajuan = await existingPengajuan.update({
            pekerjaan: pekerjaan,
            sektor: sektor,
            deskripsi: deskripsi,
            penghasilan: penghasilan,
            plafond: plafond,
            tenor: tenor,
            bagi_hasil: bagi_hasil,
            jenis_angsuran: jenis_angsuran,
            jml_angsuran: jml_angsuran,
            akad: akad,
        })

        const existingFotoUmkm = await FotoUmkm.findOne({where: {pengajuanId: pengajuanId}})
        if (request.file) {
            if (existingFotoUmkm.image1_filename !== request.files[0].filename) {
                existingFotoUmkm.image1_filename = request.files[0].filename
                existingFotoUmkm.image1_url = request.files[0].path
                existingFotoUmkm.save()
            }
            if (existingFotoUmkm.image2_filename !== request.files[1].filename) {
                existingFotoUmkm.image2_filename = request.files[1].filename
                existingFotoUmkm.image2_url = request.files[1].path
                existingFotoUmkm.save()
            }
            if (existingFotoUmkm.image3_filename !== request.files[2].filename) {
                existingFotoUmkm.image3_filename = request.files[2].filename
                existingFotoUmkm.image3_url = request.files[2].path
                existingFotoUmkm.save()
            }
        }

        responseSuccess.message = `Update Data UMKM ${pemilik.name} successfull!`
        responseSuccess.data = {
            ...updatedPengajuan['dataValues'],
            foto_umkm: existingFotoUmkm,
        }
        return responseSuccess


    } catch (error) {
        console.log(error);
        responseError.message = "update Pengajuan to database error";
        return responseError;
    }
}

async function getRiwayatPengajuan(request) {
    var responseError = new ResponseClass.ErrorResponse();
    var responseSuccess = new ResponseClass.SuccessResponse();

    const { username } = request.params

    try {
        //mengambil id pemilik pengajuan / akun
        const pemilik = await Users.findOne({ 
            where:{username: username},
            attributes: ['id']
        })

        //cari pengajuan berdasarkan pemilik
        const pengajuanResult = await Pengajuan.findAll({
            where: {pemilikId: pemilik.id},
            attributes: ['id', 'plafond', 'bagi_hasil', 'tenor', 'jml_pendanaan', 'tgl_mulai', 'tgl_berakhir', 'status']
        })

        responseSuccess.message = "Get Riwayat Pengajuan Successful!"
        responseSuccess.data = pengajuanResult
        return responseSuccess
    } catch (error) {
        console.log(error);
        responseError.message = "get riwayat Pengajuan from database error";
        return responseError;
    }
}

async function getPengajuanById(request) {
    var responseError = new ResponseClass.ErrorResponse();
    var responseSuccess = new ResponseClass.SuccessResponse();

    const {userId, pengajuanId} = request.params

    try {
        const pengajuanDetails = await Pengajuan.findOne({ 
            where: {id: pengajuanId},
            include: [
                {
                    model: Users,
                    as: "pemilikDetails",
                    attributes: ['name', 'alamat']
                }
            ]
        })

        const listInvestor = await Pendanaan.findAll({
            where: {pengajuanId: pengajuanId, status: "In Progress"},
            attributes: ['investorId']
        })

        let isFunded = false

        listInvestor.forEach((investor) => {
            if (userId == investor.investorId) {
                isFunded = true
            }
        })

        const fotoUmkm = await FotoUmkm.findOne({
            where: {pengajuanId: pengajuanId},
            attributes: ['image1_url', 'image2_url', 'image3_url']
        })

        if (!pengajuanDetails) {
            responseError.message = "Pengajuan Tidak ada!"
            return responseError
        }

        responseSuccess.message = `Get Pengajuan UMKM ${pengajuanDetails.pemilikDetails.name} successfull!`
        responseSuccess.data = {
            isFunded: isFunded,
            ...pengajuanDetails['dataValues'],
            foto_umkm: fotoUmkm
        }
        return responseSuccess
    } catch (error) {
        console.log(error);
        responseError.message = "get riwayat Pengajuan from database error";
        return responseError;
    }
}

async function addLaporanKeuangan(request){
    var responseError = new ResponseClass.ErrorResponse();
    var responseSuccess = new ResponseClass.SuccessResponse();

    const {pengajuanId} = request.params

    try {
        if (!request.file) {
            responseError.message = "File Laporan Keuangan tidak ada!"
            return responseError
        }

        let imageUrl = request.file.path
        let filename = request.file.filename

        const newLaporan = await LaporanKeuangan.create({
            pengajuanId: pengajuanId,
            laporan_url: imageUrl,
            laporan_filename: filename
        })

        responseSuccess.message = "Add new Laporan Keuangan successfull"
        responseSuccess.data = newLaporan
        return responseSuccess

    } catch (error) {
        console.log(error);
        responseError.message = "add new laporan keuangan to database error";
        return responseError;
    }
}

async function cancelPengajuan(request){
    var responseError = new ResponseClass.ErrorResponse();
    var responseSuccess = new ResponseClass.SuccessWithNoDataResponse();

    const { pengajuanId } = request.params

    try {
        
        //check apakah pengajuan memiliki pendanaan atau tidak
        const existingPendanaan = await Pendanaan.findAll({ where: {pengajuanId: pengajuanId}})
        
        if (existingPendanaan) {
            //jika ada 
            responseError.message = "Pengajuan tidak dapat dibatalkan karena sudah memiliki Investor";
            return responseError;
        }

        //jika tidak ada batalkan
        const existingPengajuan = await Pengajuan.findOne({ where: {id : pengajuanId}})
        await existingPengajuan.update({
            status: "Cancelled"
        })

        responseSuccess.message = "Pengajuan berhasil dibatalkan!"
        return responseSuccess
    } catch (error) {
        console.log(error);
        responseError.message = "change status in database error";
        return responseError;
    }
}

async function getAllPengajuan(req) {
    var responseError = new ResponseClass.ErrorResponse();
    var responseSuccess = new ResponseClass.SuccessResponse();

    try {   
        //pagination
        const pageNumber = req.params.page ? parseInt(req.params.page, 10) : 1
        const itemsPerPage = req.query.pageSize ? parseInt(req.query.pageSize, 10) : 10

        const offset = (pageNumber - 1) * itemsPerPage;
        const limit = itemsPerPage

        //query dan sort
        const wherePengajuan = {};
        const sortColumn = req.query.sort ? req.query.sort : 'jml_pendanaan';
        const sortOrder = req.query.order ? req.query.order : 'DESC';

        wherePengajuan.status = {
            [Op.like]: `%In Progress%`
        };

        if (req.query.sektor) {
            wherePengajuan.sektor = {
              [Op.like]: `%${req.query.sektor}%`
            };
        }

        if (req.query.tenor) {
            wherePengajuan.tenor = {
                [Op.like]: `%${req.query.tenor}%`
            };
        }

        if (req.query.plafond) {
            wherePengajuan.plafond = {
                [Op.like]: `%${req.query.plafond}%`
            };
        }

        if (req,query.lokasi) {
            wherePengajuan.alamat = {
                [Op.like]: `%${req.query.lokasi}%`
            }
        }

        const pengajuanResult = await Pengajuan.findAll({
            where: wherePengajuan,
            include:[
                {
                    model: Users,
                    as: "pemilikDetails",
                    attributes: ['name', 'alamat']
                }
            ],
            order:[
                [sortColumn, sortOrder]
            ],
            offset: offset,
            limit: limit,
            attributes: ['id', 'sektor', 'plafond', 'bagi_hasil', 'tenor', 'jml_pendanaan', 'tgl_mulai', 'tgl_berakhir']
        })

        responseSuccess.message = "Get all pengajuan successfull!"
        responseSuccess.data = pengajuanResult
        return responseSuccess

    } catch (error) {
        console.log(error)
        responseError.message = "Get pengajuan from database error!"
        return responseError
    }
}

async function getLaporanKeuangan(request){
    var responseError = new ResponseClass.ErrorResponse();
    var responseSuccess = new ResponseClass.SuccessResponse();

    const { pengajuanId } = request.params

    try {
        const laporanResult = await LaporanKeuangan.findAll({
            where: {pengajuanId: pengajuanId},
            attributes: ['id', 'laporan_url']
        })

        if (!laporanResult) {
            responseSuccess.message = "Laporan Keuangan is not found"
            return responseSuccess
        }

        responseSuccess.message = "get laporan keuangan successfull!"
        responseSuccess.data = laporanResult
        return responseSuccess
    } catch (error) {
        console.log(error)
        responseError.message = "Get pengajuan from database error!"
        return responseError
    }
}

async function getInvestor(request) {
    var responseError = new ResponseClass.ErrorResponse();
    var responseSuccess = new ResponseClass.SuccessResponse();

    const {pengajuanId} = request.params

    try {

        const listInvestor = await Pendanaan.findAll({
            where: {
                pengajuanId: pengajuanId,
                status: "In Progress" || "Completed"
            },
            include: [
                {
                    model: Users,
                    as: "investorDetails",
                    attributes: ['name']
                }
            ],
            attributes: ['investorId', 'nominal']
        })

        responseSuccess.message = "Get list investor successfull!"
        responseSuccess.data = listInvestor
        return responseSuccess
    } catch (error) {
        console.log(error)
        responseError.message = "Get list investor from database error!"
        return responseError
    }
}

function hitungJmlAngsuran(plafond, tenor, bagi_hasil) {
    /* 
        1. Rumus perhitungan jumlah angsuran per-tenor
        = (plafond/tenor * %bagi hasil)

        2.  rumus jml_angsuran
        = (plafond/tenor) + jml_bagi hasil 
    */
    const jml_bagi_hasil = (plafond/tenor) * (bagi_hasil/100)

    const jml_angsuran = (plafond/tenor) + jml_bagi_hasil

    return jml_angsuran
}

export default {
    createPengajuan,
    updatePengajuanById,
    getRiwayatPengajuan,
    getPengajuanById,
    addLaporanKeuangan,
    cancelPengajuan,
    getAllPengajuan,
    getLaporanKeuangan,
    getInvestor,
}