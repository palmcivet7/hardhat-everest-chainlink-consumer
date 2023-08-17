// Suppress "Duplicate definition of" warnings caused by ethers v5
const customLog = (msg) => {
    if (/Duplicate definition of/.test(msg)) {
        return
    }
    console.log(msg)
}
console.log = customLog

const { expect } = require("chai")
const { constants, expectRevert, expectEvent, time } = require("@openzeppelin/test-helpers")
const { oracle, helpers } = require("@chainlink/test-helpers")
const Web3 = require("web3")
const web3 = new Web3()

describe("EverestConsumer", function () {
    let owner, stranger, revealer, revealee, node, randomAddress
    const jobId = "509e8dd8de054d3f918640ab0a2b77d8"
    const oraclePayment = "1000000000000000000" // 10 ** 18
    const defaultSignUpURL = "https://everest.org"

    beforeEach(async function () {
        ;[owner, stranger, revealer, revealee, node, randomAddress] = await ethers.getSigners()

        const LinkTokenFactory = await ethers.getContractFactory("LinkToken")
        this.link = await LinkTokenFactory.connect(owner).deploy()

        const OracleFactory = await ethers.getContractFactory("Operator")
        this.oracle = await OracleFactory.connect(owner).deploy(this.link.address, owner.address)

        const EverestConsumerFactory = await ethers.getContractFactory("EverestConsumer")
        this.consumer = await EverestConsumerFactory.connect(owner).deploy(
            this.link.address,
            this.oracle.address,
            jobId,
            oraclePayment,
            defaultSignUpURL
        )
    })

    it("should set ctor properties properly", async function () {
        expect(this.oracle.address).to.not.equal(constants.ZERO_ADDRESS)
        expect(this.consumer.address).to.not.equal(constants.ZERO_ADDRESS)

        expect(await this.consumer.oracleAddress()).to.equal(this.oracle.address)
        // expect(await this.consumer.jobId()).to.equal(ethers.utils.formatBytes32String(jobId))
        // console.log("jobId(): ", await this.consumer.jobId())
        // console.log("ethers jobID: ", ethers.utils.formatBytes32String(jobId))
        expect(await this.consumer.jobId()).to.equal(web3.utils.asciiToHex(jobId))
        expect(await this.consumer.oraclePayment()).to.equal(oraclePayment)
        expect(await this.consumer.linkAddress()).to.equal(this.link.address)
        expect(await this.consumer.signUpURL()).to.equal(defaultSignUpURL)
    })

    describe("#setOracle", function () {
        it("should set properly with owner sender", async function () {
            await this.consumer.setOracle(randomAddress.address, { from: owner.address })
            expect(await this.consumer.oracleAddress()).to.equal(randomAddress.address)
        })

        it("should revert if sender is not an owner", async function () {
            await expect(this.consumer.connect(stranger).setOracle(randomAddress.address)).to.be.revertedWith(
                "Ownable: caller is not the owner"
            )
        })
    })

    describe("#setOraclePayments", function () {
        it("should set properly with owner sender", async function () {
            await this.consumer.setOraclePayment("1", { from: owner.address })
            expect(await this.consumer.oraclePayment()).to.equal("1")
        })

        it("should revert if sender is not an owner", async function () {
            await expect(this.consumer.connect(stranger).setOraclePayment("1")).to.be.revertedWith(
                "Ownable: caller is not the owner"
            )
        })
    })

    describe("#setLink", function () {
        it("should set properly with owner sender", async function () {
            await this.consumer.connect(owner).setLink(randomAddress.address)
            expect(await this.consumer.linkAddress()).to.equal(randomAddress.address)
        })

        it("should revert if sender is not an owner", async function () {
            await expect(this.consumer.connect(stranger).setLink(randomAddress.address)).to.be.revertedWith(
                "Ownable: caller is not the owner"
            )
        })
    })

    describe("#setSignUpURL", function () {
        const url = "https://everest.sign.up.mocked.org/"
        it("should set properly with owner sender", async function () {
            await this.consumer.connect(owner).setSignUpURL(url)
            expect(await this.consumer.signUpURL()).to.equal(url)
        })

        it("should revert if sender is not an owner", async function () {
            await expect(this.consumer.connect(stranger).setSignUpURL(url)).to.be.revertedWith(
                "Ownable: caller is not the owner"
            )
        })
    })

    describe("#setJobId", function () {
        const newJobId = "7223acbd01654282865b678924126013"
        const incorrectJobId = "7223acbd01654282865b6789241260131"

        it("should set properly with owner sender", async function () {
            await this.consumer.connect(owner).setJobId(newJobId)
            // expect(await this.consumer.jobId()).to.equal(ethers.utils.formatBytes32String(newJobId))
            expect(await this.consumer.jobId()).to.equal(web3.utils.asciiToHex(newJobId))
        })

        it("should revert if sender is not an owner", async function () {
            await expect(this.consumer.connect(stranger).setJobId(newJobId)).to.be.revertedWith(
                "Ownable: caller is not the owner"
            )
        })

        it("should revert if wrong invalid job id value passed", async function () {
            await expect(this.consumer.connect(owner).setJobId(incorrectJobId)).to.be.revertedWith(
                "EverestConsumer__IncorrectLength()"
            )
        })
    })

    describe("#statusToString", function () {
        it("should return correct names", async function () {
            expect(await this.consumer.statusToString(0)).to.equal("NOT_FOUND")
            expect(await this.consumer.statusToString(1)).to.equal("KYC_USER")
            expect(await this.consumer.statusToString(2)).to.equal("HUMAN_AND_UNIQUE")
        })
    })

    describe("#getLatestSentRequestId", function () {
        it("should revert if no requests yet", async function () {
            await expect(this.consumer.getLatestSentRequestId()).to.be.revertedWith("EverestConsumer__NoRequestsYet()")
        })
    })

    describe("#getRequest #requestExists", function () {
        const mockedRequestId = ethers.utils.formatBytes32String("mocked")

        it("should revert if request with passed request id does not exist", async function () {
            expect(await this.consumer.requestExists(mockedRequestId)).to.be.false
            await expect(this.consumer.getRequest(mockedRequestId)).to.be.revertedWith(
                "EverestConsumer__RequestDoesNotExist()"
            )
        })
    })

    describe("#requestStatus #fulfill #cancelRequest", function () {
        beforeEach(async function () {
            await this.link.transfer(revealer.address, oraclePayment)
        })

        it("should revert if not enough allowance", async function () {
            await expect(this.consumer.connect(revealer).requestStatus(revealee.address)).to.be.revertedWith(
                "SafeERC20: low-level call failed"
            )
        })

        describe("if approved", function () {
            const requestExpirationMinutes = 5
            const notFoundStatus = "0"
            const kycUserStatus = "1"
            const humanUniqueStatus = "2"
            const nonZeroKycTimestamp = "1658845449"
            const zeroKycTimestamp = "0"
            const responseTypes = ["uint8", "uint256"]

            beforeEach(async function () {
                await this.link.connect(revealer).approve(this.consumer.address, oraclePayment)
                const requestTx = await this.consumer.connect(revealer).requestStatus(revealee.address)
                const receipt = await requestTx.wait()
                this.request = oracle.decodeRunRequest(receipt.logs[4])
                this.requestId = await this.consumer.connect(revealer).getLatestSentRequestId()
                this.requestTime = (await ethers.provider.getBlock("latest")).timestamp
                this.expiration = this.requestTime + requestExpirationMinutes * 60

                // Check for the "Requested" event
                await expect(requestTx)
                    .to.emit(this.consumer, "Requested")
                    .withArgs(this.requestId, revealer.address, revealee.address, this.expiration)
            })

            it("expiration time should be 5 minutes after request", async function () {
                const expirationTime = (await this.consumer.getRequest(this.requestId)).expiration
                expect(expirationTime.toString()).to.equal(this.expiration.toString())
            })

            it("should not cancel if caller is not a revealer", async function () {
                await expect(this.consumer.connect(stranger).cancelRequest(this.requestId)).to.be.revertedWith(
                    "EverestConsumer__NotOwnerOfRequest()"
                )
            })

            it("should not cancel if request is not expired", async function () {
                await expect(this.consumer.connect(revealer).cancelRequest(this.requestId)).to.be.revertedWith(
                    "Request is not expired"
                )
            })

            it("should cancel after 5 minutes", async function () {
                await ethers.provider.send("evm_increaseTime", [requestExpirationMinutes * 60])
                await ethers.provider.send("evm_mine")
                expect(await this.link.balanceOf(revealer.address)).to.equal("0")
                expect((await this.consumer.getRequest(this.requestId)).isCanceled).to.be.false
                await this.consumer.connect(revealer).cancelRequest(this.requestId)
                expect(await this.link.balanceOf(revealer.address)).to.equal(oraclePayment)
                expect((await this.consumer.getRequest(this.requestId)).isCanceled).to.be.true
            })

            it("should not fulfill from unauthorized job", async function () {
                await expect(
                    this.oracle
                        .connect(node)
                        .fulfillOracleRequest2(
                            ...oracle.convertFulfill2Params(this.request, responseTypes, [
                                kycUserStatus,
                                nonZeroKycTimestamp,
                            ])
                        )
                ).to.be.revertedWith("Not authorized sender")
            })
            describe("if job authorized", function () {
                beforeEach(async function () {
                    await this.oracle.connect(owner).setAuthorizedSenders([node.address])

                    this.doFulfill = async function (status, kycTimestamp) {
                        return this.oracle
                            .connect(node)
                            .fulfillOracleRequest2(
                                ...oracle.convertFulfill2Params(this.request, responseTypes, [status, kycTimestamp])
                            )
                    }

                    this.expectFulfill = async function (status, kycTimestamp) {
                        const tx = await this.doFulfill(status, kycTimestamp)
                        await expect(tx)
                            .to.emit(this.consumer, "Fulfilled")
                            .withArgs(this.requestId, revealer.address, revealee.address, status, kycTimestamp)

                        const fulfilledRequest = await this.consumer.getRequest(this.requestId)

                        expect(fulfilledRequest.isCanceled).to.be.false
                        expect(fulfilledRequest.isFulfilled).to.be.true

                        switch (status) {
                            case kycUserStatus:
                                expect(fulfilledRequest.isHumanAndUnique).to.be.true
                                expect(fulfilledRequest.isKYCUser).to.be.true
                                expect(fulfilledRequest.kycTimestamp.toString()).to.equal(kycTimestamp)
                                break
                            case humanUniqueStatus:
                                expect(fulfilledRequest.isHumanAndUnique).to.be.true
                                expect(fulfilledRequest.isKYCUser).to.be.false
                                expect(fulfilledRequest.kycTimestamp.toString()).to.equal(kycTimestamp)
                                break
                            case notFoundStatus:
                                expect(fulfilledRequest.isHumanAndUnique).to.be.false
                                expect(fulfilledRequest.isKYCUser).to.be.false
                                expect(fulfilledRequest.kycTimestamp.toString()).to.equal(kycTimestamp)
                                break
                            default:
                                break
                        }
                    }

                    this.expectNotFulfill = async function (status, kycTimestamp) {
                        const tx = await this.doFulfill(status, kycTimestamp)
                        await expect(tx).to.not.emit(this.consumer, "Fulfilled")

                        const fulfilledRequest = await this.consumer.getRequest(this.requestId)

                        expect(fulfilledRequest.isCanceled).to.be.false
                        expect(fulfilledRequest.isFulfilled).to.be.false
                        expect(fulfilledRequest.isHumanAndUnique).to.be.false
                        expect(fulfilledRequest.isKYCUser).to.be.false
                        expect(fulfilledRequest.kycTimestamp.toString()).to.equal("0")
                    }

                    it("should fulfill kyc status with non-zero kyc timestamp", async function () {
                        expect(fulfilledRequest.kycTimestamp.toString()).to.equal(kycTimestamp.toString())
                    })

                    it("should not fulfill kyc status with zero kyc timestamp", async function () {
                        await this.expectNotFulfill(kycUserStatus, zeroKycTimestamp)
                    })

                    it("should fulfill human unique status with zero kyc timestamp", async function () {
                        await this.expectFulfill(humanUniqueStatus, zeroKycTimestamp)
                    })

                    it("should not fulfill human unique status with non-zero kyc timestamp", async function () {
                        await this.expectNotFulfill(humanUniqueStatus, nonZeroKycTimestamp)
                    })

                    it("should fulfill not found status with zero kyc timestamp", async function () {
                        await this.expectFulfill(notFoundStatus, zeroKycTimestamp)
                    })

                    it("should not fulfill not found status with non-zero kyc timestamp", async function () {
                        await this.expectNotFulfill(notFoundStatus, nonZeroKycTimestamp)
                    })
                })
            })
        })
    })
})
